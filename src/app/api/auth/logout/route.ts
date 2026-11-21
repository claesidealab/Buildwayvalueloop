import { NextResponse } from "next/server";
import { deleteSession } from "@/server/access";
import { app, handle } from "@/server/http";
import { clearSessionCookie, sessionToken } from "@/server/session";

/** POST: sign out. */
export async function POST() {
  return handle(async () => {
    const token = await sessionToken();
    if (token) await deleteSession((await app()).db, token);
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  });
}
