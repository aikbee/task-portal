import { handler, requireId, HttpError } from "@/lib/api-utils";
import { releaseById, releaseFileResponse } from "@/lib/app-releases";

export const dynamic = "force-dynamic";

/** The APK of one published build (public, like the sideloaded file itself). */
export const GET = handler(
  async (_request, params) => {
    const r = await releaseById(requireId(params.id));
    if (!r) throw new HttpError("Release not found.", 404);
    return releaseFileResponse(r);
  },
  { auth: false }
);
