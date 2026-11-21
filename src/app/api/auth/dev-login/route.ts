import { NextResponse } from "next/server";
import { z } from "zod";
import { devLoginEnabled } from "@/server/auth-config";
import { createSession, signInDev } from "@/server/access";
import { app, handle } from "@/server/http";
import { setSessionCookie } from "@/server/session";

/** POST { email }: developer sign-in as an existing (example) user. Off in production unless AUTH_DEV_LOGIN=true. */
export async function POST(req: Request) {
  return handle(async () => {
    if (!devLoginEnabled()) return NextResponse.json({ error: "Developer sign-in is turned off" }, { status: 404 });
    const { email } = z.object({ email: z.string().email() }).strict().parse(await req.json());
    const { db } = await app();
    const session = await createSession(db, await signInDev(db, email));
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ ok: true });
  });
}
