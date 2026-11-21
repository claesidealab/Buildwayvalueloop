import { NextResponse } from "next/server";
import { z } from "zod";
import { listMembers, revokeInvitation } from "@/server/access";
import { guard, handle } from "@/server/http";

/** DELETE: revoke a pending invitation. Needs members.manage. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ ws: string; id: string }> }) {
  return handle(async () => {
    const { ws, id } = await ctx.params;
    const { db, access } = await guard(ws, "members.manage");
    await revokeInvitation(db, access, z.string().uuid().parse(id));
    return NextResponse.json(await listMembers(db, access));
  });
}
