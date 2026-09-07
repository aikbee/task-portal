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
};

export default nextConfig;
