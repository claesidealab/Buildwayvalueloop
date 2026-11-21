import { NextResponse } from "next/server";
import { z } from "zod";
import { changeRole, listMembers, removeMember } from "@/server/access";
import { guard, handle, roleSchema } from "@/server/http";

type Params = { params: Promise<{ ws: string; userId: string }> };
const uuid = z.string().uuid();

/** PATCH { role }: change a member's role. Needs members.manage. */
export async function PATCH(req: Request, ctx: Params) {
  return handle(async () => {
    const { ws, userId } = await ctx.params;
    const { db, access } = await guard(ws, "members.manage");
    const { role } = z.object({ role: roleSchema }).strict().parse(await req.json());
    await changeRole(db, access, uuid.parse(userId), role);
    return NextResponse.json(await listMembers(db, access));
  });
}

/** DELETE: remove a member. Needs members.manage. */
export async function DELETE(_req: Request, ctx: Params) {
  return handle(async () => {
    const { ws, userId } = await ctx.params;
    const { db, access } = await guard(ws, "members.manage");
    await removeMember(db, access, uuid.parse(userId));
    return NextResponse.json(await listMembers(db, access));
  });
}
