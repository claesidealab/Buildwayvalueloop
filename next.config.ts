import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Database drivers load native/WASM files at runtime; keep them out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Migrations are read from disk on first connection; ship them with the server code (needed on Vercel).
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
};

export default nextConfig;
