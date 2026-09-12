import DrawBoardDetail from "@/components/modules/DrawBoardDetail";

export const metadata = { title: "Draw Board" };

export default async function Page({ params }) {
  const { id } = await params;
  return <DrawBoardDetail id={Number(id)} />;
}
