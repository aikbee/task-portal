import { Suspense } from "react";
import BoardView from "@/components/modules/BoardView";

export const metadata = { title: "Board" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BoardView />
    </Suspense>
  );
}
