import { NextResponse } from "next/server";
import { app } from "@/server/http";
import { devLoginEnabled } from "@/server/auth-config";

export const dynamic = "force-dynamic";

/** Why a connection failed, in plain words, without echoing the connection string or server text. */
function reason(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e).toLowerCase();
  const code = String((e as { code?: string })?.code ?? "");
  if (m.includes("password authentication failed") || code === "28P01") return "The database rejected the password. Check the password in DATABASE_URL (special characters must be URL-encoded).";
  if (m.includes("tenant or user not found")) return "Supabase didn't recognise the user. Use the full user name from the session pooler string, e.g. postgres.<project-ref>.";
  if (m.includes("enotfound") || m.includes("getaddrinfo")) return "The database host name wasn't found. Check the host in DATABASE_URL.";
  if (m.includes("timeout") || m.includes("etimedout") || m.includes("econnrefused")) return "Couldn't reach the database. Use Supabase's session pooler string (port 5432 on pooler.supabase.com), not the direct connection.";
  if (m.includes("certificate") || m.includes("ssl")) return "The database needs a secure connection. Add ?sslmode=require to the end of DATABASE_URL.";
  if (m.includes("read-only") || m.includes("erofs") || m.includes("eacces")) return "DATABASE_URL isn't set for this deploy, so the app tried to use a local database, which Netlify doesn't allow.";
  if (m.includes("invalid url") || m.includes("invalid connection")) return "DATABASE_URL isn't a valid connection string.";
  return "The database connection failed for another reason. Netlify's function log for this deploy shows the details.";
}

/** GET: is the app configured and can it reach its database? Public, and reveals no secrets. */
export async function GET() {
  const hasDb = !!process.env.DATABASE_URL;
  const out: Record<string, unknown> = {
    database: hasDb ? "DATABASE_URL is set" : "DATABASE_URL is NOT set for this deploy",
    developerSignIn: devLoginEnabled() ? "on" : "off",
    aiFeatures: process.env.ANTHROPIC_API_KEY ? "on" : "off (no ANTHROPIC_API_KEY)",
  };
  try {
    await app();
    out.databaseConnection = "ok";
  } catch (e) {
    console.error("health: database", e);
    out.databaseConnection = "failed";
    out.problem = reason(e);
  }
  return NextResponse.json(out, { status: out.databaseConnection === "ok" ? 200 : 503 });
}
