import { Suspense } from "react";
import MyTasks from "@/components/modules/MyTasks";

export const metadata = { title: "My tasks" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MyTasks />
    </Suspense>
  );
}
