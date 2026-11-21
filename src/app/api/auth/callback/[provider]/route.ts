import { NextResponse } from "next/server";
import { decodeIdToken } from "arctic";
import { buildwayDomains, enabledProviders, oauthClient, type ProviderId } from "@/server/auth-config";
import { setSessionCookie, takeFlowCookie } from "@/server/session";
import { createSession, signInWithIdentity } from "@/server/access";
import { app } from "@/server/http";

type Claims = { sub?: string; oid?: string; tid?: string; email?: string; email_verified?: boolean; preferred_username?: string; name?: string };

/** GET: provider redirects back here. Exchanges the code, signs the person in and redirects to the app. */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, req.url));
  const state = await takeFlowCookie("bw_oauth_state");
  const verifier = await takeFlowCookie("bw_oauth_verifier");
  const code = url.searchParams.get("code");
  if (!enabledProviders().includes(provider as ProviderId)) return fail("provider");
  if (!code || !state || !verifier || url.searchParams.get("state") !== state) return fail("state");

  try {
    const tokens = await oauthClient(provider as ProviderId, req).validateAuthorizationCode(code, verifier);
    // The ID token comes straight from the provider's token endpoint over TLS, so its claims can be read without re-verifying the signature.
    const c = decodeIdToken(tokens.idToken()) as Claims;
    let subject: string | undefined, email: string | undefined;
    if (provider === "microsoft-entra-id") {
      subject = c.tid && c.oid ? `${c.tid}:${c.oid}` : c.sub;
      email = c.email ?? c.preferred_username;
    } else {
      subject = c.sub;
      email = c.email_verified ? c.email : undefined;
    }
    if (!subject || !email || !email.includes("@")) return fail("email");

    const { db } = await app();
    const userId = await signInWithIdentity(db, { provider, subject, email, name: c.name ?? email }, { buildwayDomains: buildwayDomains() });
    const session = await createSession(db, userId);
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.redirect(new URL("/", req.url));
  } catch (e) {
    console.error("Sign-in failed", e);
    return fail("signin");
  }
}
