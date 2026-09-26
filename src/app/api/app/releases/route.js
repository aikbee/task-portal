import { handler, ok, HttpError } from "@/lib/api-utils";
import { listReleases, createRelease, shapeRelease } from "@/lib/app-releases";
import { publishAll } from "@/lib/live";

/** Admin: every uploaded build of the Android app, newest first per package. */
export const GET = handler(async () => ok((await listReleases("android")).map((r) => shapeRelease(r))), { role: "admin" });

/** Admin: publish a build. Multipart with "file" (the APK) and an optional "notes" (what is new). The file says what it is. */
export const POST = handler(
  async (request, _params, user) => {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") throw new HttpError("Choose the APK file to publish.", 400);
    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length) throw new HttpError("The file is empty.", 400);
    const r = await createRelease(buf, { notes: form.get("notes"), userId: user.id });
    // every app that is connected right now (in front or holding its connection in the background) checks at once
    publishAll({ type: "app_release", platform: r.platform, package_name: r.package_name, version_code: r.version_code, version_name: r.version_name });
    return ok(shapeRelease(r), { status: 201 });
  },
  { role: "admin" }
);
