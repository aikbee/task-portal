import ProjectDetail from "@/components/modules/ProjectDetail";

export const metadata = { title: "Project" };

export default async function Page({ params }) {
  const { id } = await params;
  return <ProjectDetail id={Number(id)} />;
}
