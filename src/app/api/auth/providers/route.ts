import { NextResponse } from "next/server";
import { devLoginState, enabledProviders, PROVIDER_NAMES } from "@/server/auth-config";
import { EXAMPLE_USERS } from "@/server/repo";

export const dynamic = "force-dynamic";

/** GET: which sign-in options to show on the login page. */
export async function GET() {
  const dev = devLoginState();
  return NextResponse.json({
    providers: enabledProviders().map((id) => ({ id, name: PROVIDER_NAMES[id] })),
    devLogin: dev.enabled ? EXAMPLE_USERS.map((u) => ({ email: u.email, name: u.name, role: u.role.replace("_", "-") })) : null,
    devLoginNeedsPassword: dev.needsPassword,
    devLoginBlocked: dev.blocked,
  });
}
