/** Session cookie handling for route handlers. */
import { cookies } from "next/headers";
import type { DB } from "./db";
import { UnauthorizedError, validateSession, type SessionUser } from "./access";

export const SESSION_COOKIE = "bw_session";

const secure = () => process.env.NODE_ENV === "production";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", expires: expiresAt });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** The signed-in user. Throws UnauthorizedError (401) when there is none. Renews the cookie when the session was extended. */
export async function requireUser(db: DB): Promise<SessionUser> {
  const token = await sessionToken();
  const result = await validateSession(db, token);
  if (!result) throw new UnauthorizedError("Please sign in");
  if (result.renewed && token) await setSessionCookie(token, result.expiresAt);
  return result.user;
}

/** Short-lived cookies for the OAuth round trip (state and PKCE verifier). */
export async function setFlowCookie(name: string, value: string) {
  (await cookies()).set(name, value, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/api/auth", maxAge: 600 });
}

export async function takeFlowCookie(name: string): Promise<string | undefined> {
  const jar = await cookies();
  const v = jar.get(name)?.value;
  jar.delete({ name, path: "/api/auth" });
  return v;
}
