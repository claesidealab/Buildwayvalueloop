import { NextResponse } from "next/server";
import { listMyWorkspaces } from "@/server/access";
import { app, handle } from "@/server/http";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

/** GET: the signed-in user and the workspaces they belong to. */
export async function GET() {
  return handle(async () => {
    const { db } = await app();
    const user = await requireUser(db);
    return NextResponse.json({ user, workspaces: await listMyWorkspaces(db, user.id) });
  });
}
