import { Suspense } from "react";
import DrawBoardsList from "@/components/modules/DrawBoardsList";

export const metadata = { title: "Draw Board" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DrawBoardsList />
    </Suspense>
  );
}
