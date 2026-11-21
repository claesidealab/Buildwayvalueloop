import { NextResponse } from "next/server";
import { generateCodeVerifier, generateState } from "arctic";
import { enabledProviders, oauthClient, type ProviderId } from "@/server/auth-config";
import { setFlowCookie } from "@/server/session";

const SCOPES = ["openid", "profile", "email"];

/** GET: start sign-in with Microsoft or Google. */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!enabledProviders().includes(provider as ProviderId)) return NextResponse.redirect(new URL("/login?error=provider", req.url));
  const state = generateState();
  const verifier = generateCodeVerifier();
  await setFlowCookie("bw_oauth_state", state);
  await setFlowCookie("bw_oauth_verifier", verifier);
  const url = oauthClient(provider as ProviderId, req).createAuthorizationURL(state, verifier, SCOPES);
  if (provider === "google") url.searchParams.set("prompt", "select_account");
  return NextResponse.redirect(url);
}
