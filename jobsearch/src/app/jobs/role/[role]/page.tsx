import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HubPage from "@/app/components/hubs/HubPage";
import { HUB_ROLES, isHubRole, roleHub, roleLabel, topCities } from "@/app/lib/seo/hubs";
import { ROLE_INFO } from "@/app/lib/practice/roles";

export const revalidate = 900;
export const dynamicParams = true;

export function generateStaticParams() {
  return HUB_ROLES.map((role) => ({ role }));
}

export async function generateMetadata({ params }: { params: Promise<{ role: string }> }): Promise<Metadata> {
  const { role } = await params;
  if (!isHubRole(role)) return {};
  const data = await roleHub(role).catch(() => null);
  const n = data?.total ? `${data.total.toLocaleString()} ` : "";
  const title = `משרות ${roleLabel(role)} בישראל`;
  return {
    title: `${title} | JobMatch`,
    description: `${n}משרות ${roleLabel(role)} פתוחות, ישירות מדפי הקריירה של החברות, מתעדכנות כל חצי שעה. סינון לפי שנות ניסיון, טכנולוגיה ועיר.`,
    alternates: { canonical: `/jobs/role/${role}` },
    openGraph: { title, description: `${n}משרות ${ROLE_INFO[role].en} בישראל` },
  };
}

export default async function RoleHub({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!isHubRole(role)) notFound();
  const [data, cities] = await Promise.all([roleHub(role), topCities(12)]);
  return (
    <HubPage
      title={`משרות ${roleLabel(role)} בישראל`}
      intro={`משרות ${ROLE_INFO[role].en} בחברות בישראל, מהטריות ביותר. כל משרה מגיעה ישירות מדף הקריירה של החברה, עם שנות הניסיון הנדרשות והטכנולוגיות שמופיעות בה. ${ROLE_INFO[role].stack}.`}
      data={data}
      path={`/?q=${encodeURIComponent(ROLE_INFO[role].en.split(" ")[0])}`}
      cities={cities}
      current={{ role }}
    />
  );
}
