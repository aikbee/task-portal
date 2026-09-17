import OpenNotification from "@/components/modules/OpenNotification";

export const metadata = { title: "Opening…" };

/** Where links in notification emails point: opens the entry's page in the workspace it belongs to. */
export default async function Page({ params }) {
  const { id } = await params;
  return <OpenNotification id={id} />;
}
