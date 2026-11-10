import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { partnerBySlug } from "@/app/lib/partners/partners";
import PartnerLandingView from "./PartnerLandingView";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
const KIND_HE: Record<string, string> = { bootcamp: "בוגרי הבוטקמפ", college: "סטודנטים ובוגרים", community: "חברי הקהילה", other: "חברי התוכנית" };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = await partnerBySlug(slug);
  if (!p || !p.active) return { title: "תוכנית שותפים", robots: { index: false } };
  return { title: `${p.name} × JobMatch — חיפוש עבודה עם סוכני AI ל${KIND_HE[p.kind] || "חברי התוכנית"}`, description: p.blurb || `${KIND_HE[p.kind] || "חברי"} ${p.name} מקבלים את JobMatch: התאמה למשרות, הגשה אוטומטית, ראיונות קוליים והכנה לפי חברה.`, alternates: { canonical: `/partners/${p.slug}` } };
}

/** Partner landing: what the cohort gets, and the signup link that carries the invite code. */
export default async function PartnerLanding({ params }: { params: Params }) {
  const { slug } = await params;
  const p = await partnerBySlug(slug);
  if (!p || !p.active) notFound();
  return <PartnerLandingView name={p.name} kind={p.kind} cohort={p.cohort || undefined} blurb={p.blurb || undefined} inviteCode={p.inviteCode} />;
}
