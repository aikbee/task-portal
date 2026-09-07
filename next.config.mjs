/** @type {import('next').NextConfig} */
const nextConfig = {
  // Deployments build into a throwaway directory (NEXT_DIST_DIR=.next.new) and then
  // swap it into place, so the running app never serves a half-written build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
