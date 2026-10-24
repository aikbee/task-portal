import { handler, ok, readJson } from "@/lib/api-utils";
import { reviewAccount, createReviewAccount, removeReviewAccount, REVIEW_DEFAULT_EMAIL } from "@/lib/review-account";

/** Admin: the App Review account (null when there is none) and the address a new one gets by default. */
export const GET = handler(async () => ok({ account: await reviewAccount(), default_email: REVIEW_DEFAULT_EMAIL }), { role: "admin" });

/** Admin: { email? } — makes the account, its friend and the sample workspace; the answer is the only time the password is shown. */
export const POST = handler(
  async (request, _params, user) => {
    const body = await readJson(request).catch(() => ({}));
    const made = await createReviewAccount({ email: body?.email }, user.id);
    return ok({ ...made, account: await reviewAccount() }, { status: 201 });
  },
  { role: "admin" }
);

/** Admin: deletes the account and its friend with everything in them. */
export const DELETE = handler(async () => {
  await removeReviewAccount();
  return ok({ account: null });
}, { role: "admin" });
