import { NextResponse } from "next/server";
import { z } from "zod";
import { inviteMember, listMembers } from "@/server/access";
import { guard, handle, roleSchema } from "@/server/http";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ ws: string }> };

/** GET members and pending invitations. Any member may see who else is in the workspace. */
export async function GET(_req: Request, ctx: Params) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { db, access } = await guard(ws, "workspace.read");
    return NextResponse.json(await listMembers(db, access));
  });
}

/** POST { email, role }: add an existing user or invite a new one. Needs members.manage. */
export async function POST(req: Request, ctx: Params) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { db, access } = await guard(ws, "members.manage");
    const body = z.object({ email: z.string().trim().email(), role: roleSchema }).strict().parse(await req.json());
    await inviteMember(db, access, body.email, body.role);
    return NextResponse.json(await listMembers(db, access), { status: 201 });
  });
}
