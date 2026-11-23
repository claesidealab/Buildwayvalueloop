import { NextResponse } from "next/server";
import { z } from "zod";
import { devLoginState, devPasswordOk } from "@/server/auth-config";
import { createSession, signInDev } from "@/server/access";
import { app, handle } from "@/server/http";
import { setSessionCookie } from "@/server/session";

/**
 * POST { email, password }: developer sign-in as an existing (example) user.
 * Off in production unless AUTH_DEV_LOGIN=true, and there it also needs AUTH_DEV_PASSWORD.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const state = devLoginState();
    if (!state.enabled) return NextResponse.json({ error: "Developer sign-in is turned off" }, { status: 404 });
    if (state.blocked) return NextResponse.json({ error: state.blocked }, { status: 403 });
    const { email, password } = z.object({ email: z.string().email(), password: z.string().max(200).optional() }).strict().parse(await req.json());
    if (!devPasswordOk(password)) {
      // Slow down guessing.
      await new Promise((r) => setTimeout(r, 800));
      return NextResponse.json({ error: "Wrong password" }, { status: 401 });
    }
    const { db } = await app();
    const session = await createSession(db, await signInDev(db, email));
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ ok: true });
  });
}
