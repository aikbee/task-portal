import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { destroySession } from "@/lib/auth";
import { verifySensitive } from "@/lib/verify";
import { deletionSummary, deleteAccount } from "@/lib/accounts";
import { notifyAdmins } from "@/lib/notifications";
import { renderEmail, sendMail } from "@/lib/mail";

/** What deleting my account would take with it (Security page, the iPhone app). */
export const GET = handler(async (_request, _params, user) => ok({ name: user.name, email: user.email, ...(await deletionSummary(user.id)) }));

/**
 * Delete my own account: { password }. Only a signed-in person can, never an API token, and only with the password
 * (an unlocked session is not enough for this one). Everything that is only theirs goes (lib/accounts.js); the
 * session ends with it.
 */
export const DELETE = handler(async (request, _params, user) => {
  if (!user.session_id) throw new HttpError("Sign in to delete your account.", 403);
  const password = String((await readJson(request)).password ?? "");
  if (!password) throw new HttpError("Enter your password to delete your account.", 400);
  await verifySensitive(user, { password });
  const gone = await deleteAccount(user.id);
  await destroySession(request); // the session row went with the account; this clears the cookie
  notifyAdmins({ id: gone.id }, { type: "user_deleted", title: `Account deleted by its owner: ${gone.name}`, body: gone.email, href: "/users", entityType: "user", entityId: gone.id }).catch(() => {});
  const { html, text } = renderEmail({
    title: "Your account was deleted",
    lines: [
      `The Task Portal account ${gone.email} was deleted, together with its profiles, tasks, files and chat messages.`,
      "If this was not you, tell the administrator of the portal.",
    ],
  });
  sendMail({ to: gone.email, subject: "Your Task Portal account was deleted", text, html, kind: "account_deleted" }).catch(() => {});
  return ok({ deleted: true });
});
