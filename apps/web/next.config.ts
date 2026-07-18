import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // We ship our own server.js (bind/auth guard must run before Next ever
  // listens), so we deliberately don't use `output: "standalone"` here —
  // Docker copies node_modules + .next + server.js directly instead.
  serverExternalPackages: ["pino", "pino-pretty"],
};

export default nextConfig;
