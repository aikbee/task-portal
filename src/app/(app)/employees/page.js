import { Suspense } from "react";
import EmployeesList from "@/components/modules/EmployeesList";

export const metadata = { title: "Employees" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EmployeesList />
    </Suspense>
  );
}
