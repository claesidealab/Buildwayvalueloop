import { NextResponse } from "next/server";
import { z } from "zod";
import { createWorkspace } from "@/server/access";
import { app, handle } from "@/server/http";
import { requireUser } from "@/server/session";

/** POST { name, slug }: create a workspace. Buildway staff only; the creator becomes its advisor. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = z.object({ name: z.string().trim().min(2).max(80), slug: z.string().trim().min(1).max(48) }).strict().parse(await req.json());
    const { db } = await app();
    const user = await requireUser(db);
    const ws = await createWorkspace(db, user, body);
    return NextResponse.json({ slug: ws.slug, name: ws.name }, { status: 201 });
  });
}
