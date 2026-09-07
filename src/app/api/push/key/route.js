import { handler, ok } from "@/lib/api-utils";
import { pushPublicKey } from "@/lib/push";

/** VAPID public key the browser needs to subscribe; null when push is not configured. */
export const GET = handler(async () => ok({ publicKey: pushPublicKey() }));
