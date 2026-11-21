/**
 * Sign-in configuration from environment variables. A provider is offered only when all its keys are set.
 *
 *   MICROSOFT_ENTRA_TENANT_ID, MICROSOFT_ENTRA_CLIENT_ID, MICROSOFT_ENTRA_CLIENT_SECRET
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   AUTH_URL                 public base URL, e.g. https://loop.buildway.se (redirect URIs: <AUTH_URL>/api/auth/callback/<provider>)
 *   BUILDWAY_EMAIL_DOMAINS   comma-separated; people signing in with these domains are Buildway staff (default buildway.se)
 *   AUTH_DEV_LOGIN           "true" turns on the developer sign-in; it is on by default outside production
 */
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

export function buildwayDomains(): string[] {
  return (env("BUILDWAY_EMAIL_DOMAINS") ?? "buildway.se").split(",").map((d) => d.trim()).filter(Boolean);
}
