import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "bw_session";

/**
 * 1. Blocks cross-site state-changing API requests (CSRF): non-GET calls must come from this origin.
 * 2. Sends visitors without a session cookie to /login. The cookie is fully validated by every API route.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      // Compare with the host the browser used: behind a proxy (Netlify), nextUrl can carry an internal host.
      const origin = req.headers.get("origin");
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
      let sameSite = false;
      try { sameSite = !!origin && new URL(origin).host === host; } catch { sameSite = false; }
      if (origin && !sameSite && origin !== req.nextUrl.origin) {
        return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
      }
    }
    return NextResponse.next();
  }

  if (!req.cookies.get(SESSION_COOKIE)) {
    const login = new URL("/login", req.url);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/|favicon\\.ico).*)"],
};
