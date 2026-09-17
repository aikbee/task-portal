import { handler, ok, readJson } from "@/lib/api-utils";
import { adminMailSettings, saveMailSettings, mailLog } from "@/lib/mail";

/** Admin: the SMTP account (never the password, only `password_set`), the switches and the last messages. */
export const GET = handler(async () => ok({ settings: await adminMailSettings(), log: await mailLog() }), { role: "admin" });

/** Admin: save. An empty `password` keeps the stored one. */
export const PUT = handler(async (request, _params, user) => ok({ settings: await saveMailSettings(await readJson(request), user.id), log: await mailLog() }), { role: "admin" });
