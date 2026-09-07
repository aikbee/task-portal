import TaskDetail from "@/components/modules/TaskDetail";

export const metadata = { title: "Task" };

export default async function Page({ params }) {
  const { id } = await params;
  return <TaskDetail id={Number(id)} />;
}
