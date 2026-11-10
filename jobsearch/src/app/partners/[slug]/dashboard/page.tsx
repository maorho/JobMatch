import type { Metadata } from "next";
import { partnerForToken, partnerFunnel } from "@/app/lib/partners/partners";
import PartnerDashboardView from "./PartnerDashboardView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "דשבורד שותפים", robots: { index: false, follow: false } };

type Params = Promise<{ slug: string }>;
type Search = Promise<{ token?: string }>;

/** The partner's cohort funnel. No login: the dashboard token from the admin (`?token=`). */
export default async function PartnerDashboard({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const { token } = await searchParams;
  const partner = await partnerForToken(slug, token || "");
  if (!partner) return <PartnerDashboardView partner={null} funnel={null} />;
  const f = await partnerFunnel(partner.slug);
  return <PartnerDashboardView partner={{ name: partner.name, cohort: partner.cohort || undefined, inviteCode: partner.inviteCode }} funnel={{ ...f }} />;
}
