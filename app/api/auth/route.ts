import {
  clearSessionCookie,
  createSessionCookie,
  currentUser,
  hashPassword,
  hashToken,
  newSessionToken,
  passwordProblem,
  sessionExpiry,
  verifyPassword,
} from "../../lib/auth";
import { authStore } from "../../lib/store";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;
const BAD_CREDENTIALS = "That email and password do not match an account.";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  try {
    const store = await authStore();
    const user = await currentUser(request, store);
    return Response.json({ user, needsSetup: (await store.countUsers()) === 0 });
  } catch (error) {
    console.error("auth status:", error);
    return Response.json({ user: null, error: "Sign-in is temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let store: Awaited<ReturnType<typeof authStore>>;
  try {
    store = await authStore();
  } catch (error) {
    console.error("auth store:", error);
    return Response.json({ error: "Sign-in is temporarily unavailable." }, { status: 500 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = text(payload.action);
  const email = text(payload.email).toLowerCase();
  const password = typeof payload.password === "string" ? payload.password : "";

  try {
    if (action === "logout") {
      const user = await currentUser(request, store);
      if (user) {
        const rawCookie = (request.headers.get("cookie") || "")
          .split(/;\s*/)
          .find((part) => part.startsWith("truckstop_session="));
        const token = rawCookie?.slice("truckstop_session=".length).split(".")[0];
        if (token) await store.deleteSession(await hashToken(token));
      }
      return Response.json({ user: null }, { headers: { "set-cookie": clearSessionCookie() } });
    }

    if (action === "bootstrap") {
      const configuredToken = process.env.SETUP_TOKEN?.trim();
      if (!configuredToken || text(payload.setupToken) !== configuredToken) {
        return Response.json({ error: "Not available." }, { status: 404 });
      }
      if (await store.countUsers()) {
        return Response.json({ error: "An account already exists." }, { status: 409 });
      }
      const problem = passwordProblem(password);
      if (!email.includes("@") || problem) {
        return Response.json({ error: problem ?? "Enter a valid email." }, { status: 400 });
      }
      const user = await store.createUser({
        email,
        passwordHash: await hashPassword(password),
        name: text(payload.name),
        storeNumber: text(payload.storeNumber),
        role: "admin",
      });
      return Response.json({ user }, { status: 201 });
    }

    if (action === "invite") {
      const actor = await currentUser(request, store);
      if (!actor) return Response.json({ error: "Sign in to continue." }, { status: 401 });
      if (actor.role !== "admin") {
        return Response.json({ error: "Only an admin can add accounts." }, { status: 403 });
      }
      const problem = passwordProblem(password);
      if (!email.includes("@") || problem) {
        return Response.json({ error: problem ?? "Enter a valid email." }, { status: 400 });
      }
      if (await store.findUserByEmail(email)) {
        return Response.json({ error: "That email already has an account." }, { status: 409 });
      }
      const user = await store.createUser({
        email,
        passwordHash: await hashPassword(password),
        name: text(payload.name),
        storeNumber: text(payload.storeNumber) || actor.storeNumber,
        role: text(payload.role) === "manager" ? "manager" : "associate",
      });
      return Response.json({ user }, { status: 201 });
    }

    if (action !== "login") {
      return Response.json({ error: "Unknown action." }, { status: 400 });
    }
    if (!email || !password) {
      return Response.json({ error: BAD_CREDENTIALS }, { status: 401 });
    }

    const row = await store.findUserByEmail(email);
    if (!row) {
      await verifyPassword(
        password,
        "pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      );
      return Response.json({ error: BAD_CREDENTIALS }, { status: 401 });
    }

    if (row.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now()) {
      return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
    }

    if (!(await verifyPassword(password, row.passwordHash))) {
      const attempts = row.failedAttempts + 1;
      const lockedUntil = attempts >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
        : "";
      await store.recordFailure(row.id, attempts, lockedUntil);
      return Response.json({ error: BAD_CREDENTIALS }, { status: 401 });
    }

    const token = newSessionToken();
    await store.insertSession(
      await hashToken(token),
      row.id,
      sessionExpiry(),
      request.headers.get("user-agent") || "",
    );
    await store.recordSuccess(row.id, new Date().toISOString());
    await store.deleteExpiredSessions();
    return Response.json(
      { user: { id: row.id, email: row.email, name: row.name, storeNumber: row.storeNumber, role: row.role } },
      { headers: { "set-cookie": await createSessionCookie(token) } },
    );
  } catch (error) {
    console.error("auth action:", action, error);
    return Response.json({ error: "Sign-in is temporarily unavailable." }, { status: 500 });
  }
}
