import EmployeeDetail from "@/components/modules/EmployeeDetail";

export const metadata = { title: "Employee" };

export default async function Page({ params }) {
  const { id } = await params;
  return <EmployeeDetail id={Number(id)} />;
}
