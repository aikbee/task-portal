import { handler, ok } from "@/lib/api-utils";
import { resetReviewPassword, reviewAccount } from "@/lib/review-account";

/** Admin: a new password for the App Review account (shown once; the old one and its sessions stop working). */
export const POST = handler(async () => {
  const made = await resetReviewPassword();
  return ok({ ...made, account: await reviewAccount() });
}, { role: "admin" });
