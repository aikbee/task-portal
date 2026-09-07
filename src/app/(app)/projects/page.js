import { Suspense } from "react";
import ProjectsList from "@/components/modules/ProjectsList";

export const metadata = { title: "Projects" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProjectsList />
    </Suspense>
  );
}
