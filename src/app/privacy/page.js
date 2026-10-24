import LegalPage, { legalMetadata } from "@/components/legal/LegalPage";

export const generateMetadata = ({ searchParams }) => legalMetadata("privacy", searchParams);

export default function Page({ searchParams }) {
  return <LegalPage kind="privacy" searchParams={searchParams} />;
}
