/**
 * Sign-in configuration from environment variables. A provider is offered only when all its keys are set.
 *
 *   MICROSOFT_ENTRA_TENANT_ID, MICROSOFT_ENTRA_CLIENT_ID, MICROSOFT_ENTRA_CLIENT_SECRET
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   AUTH_URL                 public base URL, e.g. https://loop.buildway.se (redirect URIs: <AUTH_URL>/api/auth/callback/<provider>)
 *   BUILDWAY_EMAIL_DOMAINS   comma-separated; people signing in with these domains are Buildway staff (default buildway.se)
 *   AUTH_DEV_LOGIN           "true" turns on the developer sign-in; it is on by default outside production
 *   AUTH_DEV_PASSWORD        password for the developer sign-in; required in production, optional in development
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { Google, MicrosoftEntraId } from "arctic";

export type ProviderId = "microsoft-entra-id" | "google";

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  "microsoft-entra-id": "Microsoft",
  google: "Google",
};

const env = (k: string) => process.env[k]?.trim() || undefined;

export function baseUrl(req: Request): string {
  return env("AUTH_URL") ?? new URL(req.url).origin;
}

export function enabledProviders(): ProviderId[] {
  const out: ProviderId[] = [];
  if (env("MICROSOFT_ENTRA_TENANT_ID") && env("MICROSOFT_ENTRA_CLIENT_ID") && env("MICROSOFT_ENTRA_CLIENT_SECRET")) out.push("microsoft-entra-id");
  if (env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET")) out.push("google");
  return out;
}

export function oauthClient(id: ProviderId, req: Request) {
  const redirect = `${baseUrl(req)}/api/auth/callback/${id}`;
  if (id === "microsoft-entra-id") {
    return new MicrosoftEntraId(env("MICROSOFT_ENTRA_TENANT_ID")!, env("MICROSOFT_ENTRA_CLIENT_ID")!, env("MICROSOFT_ENTRA_CLIENT_SECRET")!, redirect);
  }
  return new Google(env("GOOGLE_CLIENT_ID")!, env("GOOGLE_CLIENT_SECRET")!, redirect);
}

export function devLoginEnabled(): boolean {
  const v = env("AUTH_DEV_LOGIN");
  if (v) return v === "true";
  return process.env.NODE_ENV !== "production";
}

/**
 * Whether developer sign-in needs a password, and whether it can be used at all.
 * In production it is refused unless AUTH_DEV_PASSWORD is set, so a public site is never open.
 */
export function devLoginState(): { enabled: boolean; needsPassword: boolean; blocked: string | null } {
  if (!devLoginEnabled()) return { enabled: false, needsPassword: false, blocked: null };
  const pw = env("AUTH_DEV_PASSWORD");
  const prod = process.env.NODE_ENV === "production";
  if (prod && !pw) return { enabled: true, needsPassword: true, blocked: "Developer sign-in needs a password on this site. Add AUTH_DEV_PASSWORD to the site's environment variables and redeploy." };
  return { enabled: true, needsPassword: !!pw, blocked: null };
}

const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();

/** Checks a developer sign-in password in constant time. */
export function devPasswordOk(given: string | undefined): boolean {
  const state = devLoginState();
  if (!state.enabled || state.blocked) return false;
  if (!state.needsPassword) return true;
  return timingSafeEqual(digest(given ?? ""), digest(env("AUTH_DEV_PASSWORD")!));
}

export function buildwayDomains(): string[] {
  return (env("BUILDWAY_EMAIL_DOMAINS") ?? "buildway.se").split(",").map((d) => d.trim()).filter(Boolean);
}
