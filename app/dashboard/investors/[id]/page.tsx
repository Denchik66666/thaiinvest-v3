import InvestorDetailPageClient from "./InvestorDetailPageClient";

export default async function InvestorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvestorDetailPageClient investorId={id} />;
}
