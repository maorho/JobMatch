import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Landing from "./components/Landing";
import { getUserIdFromToken } from "./lib/getUserIdFromRequest";

export const dynamic = "force-dynamic";

/**
 * The front door. Visitors get the landing page (what the catalogue is, how it
 * works, where to start) without loading a single posting; people who are
 * signed in go straight to their feed at /jobs.
 */
export default async function Home() {
  const token = (await cookies()).get("token")?.value;
  const userId = token ? await getUserIdFromToken(token).catch(() => null) : null;
  if (userId) redirect("/jobs");
  return <Landing />;
}
