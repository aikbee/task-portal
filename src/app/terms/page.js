import LegalPage, { legalMetadata } from "@/components/legal/LegalPage";

export const generateMetadata = ({ searchParams }) => legalMetadata("terms", searchParams);

export default function Page({ searchParams }) {
  return <LegalPage kind="terms" searchParams={searchParams} />;
}
