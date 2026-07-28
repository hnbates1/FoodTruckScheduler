const ITERATIONS = 210_000;
const SESSION_DAYS = 14;
const COOKIE = "truckstop_session";
const encoder = new TextEncoder();

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  storeNumber: string;
  role: string;
};

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterationsText, saltText, hashText] = stored.split("$");
  const iterations = Number(iterationsText);
  if (scheme !== "pbkdf2" || !Number.isInteger(iterations) || !saltText || !hashText) return false;
  try {
    const computed = await pbkdf2(password, fromBase64(saltText), iterations);
    return timingSafeEqual(computed, fromBase64(hashText));
  } catch {
    return false;
  }
}

export function passwordProblem(password: string) {
  if (password.length < 12) return "Use at least 12 characters.";
  if (/^\d+$/.test(password)) return "Use more than digits.";
  if (["password", "truckstop", "lowes", "letmein"].some((word) => password.toLowerCase().includes(word))) {
    return "That password is too easy to guess.";
  }
  return null;
}

async function sessionSecret() {
  const { env } = await import("cloudflare:workers");
  const value = (env as unknown as { SESSION_SECRET?: string }).SESSION_SECRET?.trim();
  if (!value) throw new Error("SESSION_SECRET is not set");
  return value;
}

async function sign(token: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(await sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(token));
  return toBase64(new Uint8Array(signature)).replace(/=+$/, "");
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return toBase64(new Uint8Array(digest));
}

export async function createSessionCookie(token: string) {
  const value = `${token}.${await sign(token)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function newSessionToken() {
  return toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/[^A-Za-z0-9]/g, "");
}

export function sessionExpiry() {
  return new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
}

async function readCookieToken(request: Request) {
  const part = (request.headers.get("cookie") || "")
    .split(/;\s*/)
    .find((cookie) => cookie.startsWith(`${COOKIE}=`));
  if (!part) return null;
  const [token, signature] = part.slice(COOKIE.length + 1).split(".");
  if (!token || !signature) return null;
  const expected = await sign(token);
  return timingSafeEqual(encoder.encode(signature), encoder.encode(expected)) ? token : null;
}

type SessionStore = {
  findSession(tokenHash: string): Promise<{ user: SessionUser; expiresAt: string } | null>;
  deleteSession(tokenHash: string): Promise<void>;
};

export async function currentUser(request: Request, store: SessionStore) {
  const token = await readCookieToken(request);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const session = await store.findSession(tokenHash);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await store.deleteSession(tokenHash);
    return null;
  }
  return session.user;
}

export function unauthorized() {
  return Response.json({ error: "Sign in to continue." }, { status: 401 });
}
