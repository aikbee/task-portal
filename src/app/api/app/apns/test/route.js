import { handler, ok, HttpError } from "@/lib/api-utils";
import { readApnsSettings, testApnsKey } from "@/lib/apns";

/** Admin: does Apple take the saved key? Asked without a phone (see testApnsKey). */
export const POST = handler(
  async () => {
    const s = await readApnsSettings();
    if (!s.ready) throw new HttpError("Save the Team ID, the Key ID and the .p8 key first.", 400);
    try {
      return ok(await testApnsKey(s));
    } catch (e) {
      throw new HttpError(e.message, 502);
    }
  },
  { role: "admin" }
);
