import { handler, requireId } from "@/lib/api-utils";
import { conversationFor } from "@/lib/chat";
import { exportConversation } from "@/lib/chat-export";

/** Download this chat: ?format=txt (transcript), json, or zip (transcript + JSON + every file). What you deleted on your side stays out. */
export const GET = handler(async (request, params, user) => {
  const convo = await conversationFor(requireId(params.id), user.id);
  return exportConversation(convo, { format: request.nextUrl.searchParams.get("format"), floor: Number(convo.hidden_before_id) || 0, by: user });
});
