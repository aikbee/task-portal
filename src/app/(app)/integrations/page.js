import { Suspense } from "react";
import IntegrationsPage from "@/components/modules/PmsIntegration";

export const metadata = { title: "Integrations" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <IntegrationsPage />
    </Suspense>
  );
}
