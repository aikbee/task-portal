import RequirementDetail from "@/components/modules/RequirementDetail";

export const metadata = { title: "Requirement" };

export default async function Page({ params }) {
  const { id } = await params;
  return <RequirementDetail id={Number(id)} />;
}
