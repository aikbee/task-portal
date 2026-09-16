import { handler, ok } from "@/lib/api-utils";
import { readChatSettings } from "@/lib/chat";
import { iceServersFor } from "@/lib/calls";

/** ICE servers for the browser's RTCPeerConnection: public STUN, plus the TURN server an administrator configured (if any). */
export const GET = handler(async () => ok({ iceServers: iceServersFor(await readChatSettings()) }));
