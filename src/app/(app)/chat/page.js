import { Suspense } from "react";
import ChatModule from "@/components/modules/ChatModule";

export const metadata = { title: "Chat" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ChatModule />
    </Suspense>
  );
}
