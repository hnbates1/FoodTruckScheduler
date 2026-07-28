import { hashPassword, passwordProblem } from "../../../lib/auth";
import { requireSession } from "../../../lib/guard";
import { authStore } from "../../../lib/store";

export const dynamic = "force-dynamic";

function value(input: unknown) {
  return typeof input === "string" ? input.trim() : "";
}

async function admin(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session;
  if (session.user.role !== "admin") {
    return { response: Response.json({ error: "Administrator access is required." }, { status: 403 }) };
  }
  return session;
}

export async function GET(request: Request) {
  const session = await admin(request);
  if ("response" in session) return session.response;
  return Response.json({ users: await (await authStore()).listUsers() });
}

export async function POST(request: Request) {
  const session = await admin(request);
  if ("response" in session) return session.response;
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = value(payload.email).toLowerCase();
  const password = typeof payload.password === "string" ? payload.password : "";
  const role = value(payload.role) === "manager" ? "manager" : "associate";
  const problem = passwordProblem(password);
  const store = await authStore();
  if (!email.includes("@") || problem) {
    return Response.json({ error: problem ?? "Enter a valid email." }, { status: 400 });
  }
  if (await store.findUserByEmail(email)) {
    return Response.json({ error: "That email already has an account." }, { status: 409 });
  }
  await store.createUser({
    email,
    passwordHash: await hashPassword(password),
    name: value(payload.name),
    storeNumber: value(payload.storeNumber) || session.user.storeNumber,
    role,
  });
  return Response.json({ users: await store.listUsers() }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await admin(request);
  if ("response" in session) return session.response;
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const userId = Number(payload.id);
  const role = value(payload.role);
  if (!Number.isInteger(userId) || !["admin", "manager", "associate"].includes(role)) {
    return Response.json({ error: "Choose a valid account and role." }, { status: 400 });
  }
  const store = await authStore();
  const target = (await store.listUsers()).find((user) => user.id === userId);
  if (!target) return Response.json({ error: "Account not found." }, { status: 404 });
  if (userId === session.user.id && role !== "admin") {
    return Response.json({ error: "You cannot remove your own administrator access." }, { status: 400 });
  }
  if (target.role === "admin" && role !== "admin" && await store.countAdmins() <= 1) {
    return Response.json({ error: "At least one administrator is required." }, { status: 400 });
  }
  await store.updateUserRole(userId, role);
  return Response.json({ users: await store.listUsers() });
}

export async function DELETE(request: Request) {
  const session = await admin(request);
  if ("response" in session) return session.response;
  const userId = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(userId)) return Response.json({ error: "Choose a valid account." }, { status: 400 });
  if (userId === session.user.id) {
    return Response.json({ error: "You cannot delete your own account." }, { status: 400 });
  }
  const store = await authStore();
  const target = (await store.listUsers()).find((user) => user.id === userId);
  if (!target) return Response.json({ error: "Account not found." }, { status: 404 });
  if (target.role === "admin" && await store.countAdmins() <= 1) {
    return Response.json({ error: "At least one administrator is required." }, { status: 400 });
  }
  await store.deleteUser(userId);
  return Response.json({ users: await store.listUsers() });
}
