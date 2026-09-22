import { handler, ok } from "@/lib/api-utils";
import { latestRelease, shapeRelease } from "@/lib/app-releases";

/**
 * The newest published build for ?package= (the app sends its own package name; default: the release app). Public:
 * an app that is signed out, or whose session ended, can still update itself. { release: {…} | null }.
 */
export const GET = handler(
  async (request) => {
    const pkg = String(request.nextUrl.searchParams.get("package") || "com.systemportal.task").slice(0, 160);
    return ok({ release: shapeRelease(await latestRelease("android", pkg)) });
  },
  { auth: false }
);
