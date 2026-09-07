import InfoDetail from "@/components/modules/InfoDetail";

export const metadata = { title: "Info" };

export default async function Page({ params }) {
  const { id } = await params;
  return <InfoDetail id={Number(id)} />;
}
