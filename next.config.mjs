import { execSync } from "node:child_process";

/** The commit being built, so /api/health can report exactly what is deployed. */
function gitCommit() {
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT;
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Deployments build into a throwaway directory (NEXT_DIST_DIR=.next.new) and then
  // swap it into place, so the running app never serves a half-written build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: { GIT_COMMIT: gitCommit() },
  // Development only: the Android emulator reaches this Mac as 10.0.2.2. Without this the dev server refuses its
  // dev-only endpoints to the app's WebView, and the /bg page (the backgrounds behind the app's screens) never starts there.
  allowedDevOrigins: ["10.0.2.2"],
  experimental: {
    // src/proxy.js runs on every request, and Next buffers the body for it (10 MB by default,
    // silently truncating larger uploads). Attachments go up to 50 MB, chat files to 25 MB per message.
    proxyClientMaxBodySize: "60mb",
  },
};

export default nextConfig;
