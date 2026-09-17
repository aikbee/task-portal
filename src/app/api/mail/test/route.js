import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { readMailSettings, renderEmail, sendMail, linkTo, mailLog, MAIL_SECURITY } from "@/lib/mail";

/** Admin: send a test message to { to } (default: my own address) with the values in the form (saved or not); 502 carries the server's reason. */
export const POST = handler(
  async (request, _params, user) => {
    const body = await readJson(request);
    const to = String(body.to ?? user.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError("That does not look like an email address.", 400);
    // try what is in the form, saved or not; an empty password means "the stored one"
    const saved = await readMailSettings();
    const settings = { ...saved };
    for (const k of ["host", "username", "from_name", "from_email", "app_url"]) if (typeof body[k] === "string") settings[k] = body[k].trim();
    if (body.port !== undefined) settings.port = Number(body.port) || saved.port;
    if (MAIL_SECURITY.includes(body.secure)) settings.secure = body.secure;
    if (typeof body.password === "string" && body.password !== "") settings.password = body.password;
    if (!(settings.host && settings.from_email)) throw new HttpError("Enter the mail server and the sender address first.", 400);
    const { html, text } = renderEmail({ title: "Email works", lines: ["This is a test message from your Task Portal.", "If you can read it, password resets, invitations and notification emails can be delivered."], action: { label: "Open Task Portal", url: linkTo(settings, "/", request) }, footer: `Sent on request of ${user.name}.` });
    await sendMail({ to, subject: "Task Portal: test message", text, html, kind: "test", settings, strict: true });
    return ok({ sent_to: to, log: await mailLog() });
  },
  { role: "admin" }
);
