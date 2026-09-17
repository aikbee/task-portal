import { Suspense } from "react";
import TrashPage from "@/components/modules/TrashPage";

export const metadata = { title: "Recycle bin" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TrashPage />
    </Suspense>
  );
}
