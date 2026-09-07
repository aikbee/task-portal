import { Suspense } from "react";
import NotificationsList from "@/components/modules/NotificationsList";

export const metadata = { title: "Notifications" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <NotificationsList />
    </Suspense>
  );
}
