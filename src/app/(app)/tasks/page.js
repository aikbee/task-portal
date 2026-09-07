import { Suspense } from "react";
import TasksList from "@/components/modules/TasksList";

export const metadata = { title: "Tasks" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TasksList />
    </Suspense>
  );
}
