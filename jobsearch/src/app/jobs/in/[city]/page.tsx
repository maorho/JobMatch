import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HubPage from "@/app/components/hubs/HubPage";
import { cityHub, topCities } from "@/app/lib/seo/hubs";

export const revalidate = 900;
export const dynamicParams = true;

export async function generateStaticParams() {
  const cities = await topCities(25).catch(() => []);
  return [{ city: "remote" }, ...cities.map((c) => ({ city: c.city }))];
}

const displayName = (city: string) => (city.toLowerCase() === "remote" ? "מרחוק" : `ב${decodeURIComponent(city)}`);

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city } = await params;
  const name = decodeURIComponent(city);
  const data = await cityHub(name).catch(() => null);
  const n = data?.total ? `${data.total.toLocaleString()} ` : "";
  const title = `משרות הייטק ${displayName(city)}`;
  return {
    title: `${title} | JobMatch`,
    description: `${n}משרות הייטק פתוחות ${displayName(city)}, ישירות מדפי הקריירה של החברות, מתעדכנות כל חצי שעה.`,
    alternates: { canonical: `/jobs/in/${encodeURIComponent(name)}` },
  };
}

export default async function CityHub({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const name = decodeURIComponent(city);
  if (!/^[\p{L}\p{N}' .-]{2,40}$/u.test(name)) notFound();
  const [data, cities] = await Promise.all([cityHub(name), topCities(12)]);
  if (data.total === 0 && name.toLowerCase() !== "remote" && !cities.some((c) => c.city.toLowerCase() === name.toLowerCase())) notFound();
  const remote = name.toLowerCase() === "remote";
  return (
    <HubPage
      title={`משרות הייטק ${displayName(city)}`}
      intro={remote ? "משרות שאפשר לעשות מרחוק, מחברות ישראליות וגלובליות שמגייסות בישראל." : `משרות הייטק פתוחות ב${name}, מהטריות ביותר. כל משרה מגיעה ישירות מדף הקריירה של החברה.`}
      data={data}
      path={remote ? "/?jobType=Remote" : `/?city=${encodeURIComponent(name)}`}
      cities={cities}
      current={{ city: remote ? "remote" : name }}
    />
  );
}
