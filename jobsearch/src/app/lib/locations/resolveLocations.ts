import OpenAI from "openai";
import { connectToDatabase } from "@/app/lib/db";
import LocationAlias from "@/app/models/LocationAlias";
import { normalizeLocation, type NormalizedLocation } from "./normalizeLocation";

/**
 * The location agent — stage 2.
 *
 * resolveRawLocations(raws) returns a canonical location for every raw string:
 *   1. cache hit in LocationAlias (resolved before) → reuse
 *   2. deterministic rules (normalizeLocation) → cache when confident
 *   3. the residue (confidence "low") → one batched LLM call, strict JSON,
 *      validated, cached as source "llm"
 * Without an OpenAI key (or with useLLM=false) step 3 is skipped and the rules
 * answer is kept, so ingestion never depends on the LLM.
 */
export type ResolvedLocation = Pick<NormalizedLocation, "city" | "country" | "remote" | "region"> & {
  source: "rules" | "llm" | "manual";
  confidence: NormalizedLocation["confidence"];
};

export type ResolveOptions = {
  useLLM?: boolean;
  model?: string;
  /** Recompute rules-sourced cache entries (after a rules upgrade); LLM answers are kept. */
  ignoreRulesCache?: boolean;
};

const LLM_BATCH = 40;

function fromNormalized(n: NormalizedLocation, source: ResolvedLocation["source"]): ResolvedLocation {
  return { city: n.city, country: n.country, region: n.region, remote: n.remote, source, confidence: n.confidence };
}

async function resolveWithLLM(raws: string[], model: string): Promise<Map<string, ResolvedLocation>> {
  const out = new Map<string, ResolvedLocation>();
  if (!process.env.OPENAI_API_KEY || raws.length === 0) return out;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (let i = 0; i < raws.length; i += LLM_BATCH) {
    const batch = raws.slice(i, i + LLM_BATCH);
    try {
      const res = await openai.chat.completions.create({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You normalize job-posting location strings from applicant tracking systems. " +
              "For each input return the primary location only (first one when several are listed). " +
              "Output JSON: {\"items\":[{\"raw\":string,\"city\":string,\"country\":string,\"remote\":boolean}]}. " +
              "country = the English short name (e.g. \"Israel\", \"United States\", \"United Kingdom\"), \"\" if unknown. " +
              "city = canonical English city name (\"Tel Aviv\" for Tel Aviv-Yafo/TLV; Hebrew → English), \"\" if the string names only a country/region/state or is a street address. " +
              "remote = true when the role is remote/work-from-home. Never invent a city. Return exactly one item per input, same raw string.",
          },
          { role: "user", content: JSON.stringify({ inputs: batch }) },
        ],
      });
      const text = res.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(text);
      const items: any[] = Array.isArray(parsed?.items) ? parsed.items : [];
      for (const it of items) {
        if (!it || typeof it.raw !== "string" || !batch.includes(it.raw)) continue;
        const city = typeof it.city === "string" ? it.city.trim().slice(0, 60) : "";
        const country = typeof it.country === "string" ? it.country.trim().slice(0, 60) : "";
        out.set(it.raw, { city, country, remote: it.remote === true, source: "llm", confidence: country ? "high" : "low" });
      }
    } catch (err) {
      console.warn("[locations] LLM batch failed, keeping rules result:", (err as Error)?.message);
    }
  }
  return out;
}

export async function resolveRawLocations(
  rawInputs: { city?: string; country?: string }[],
  opts: ResolveOptions = {}
): Promise<Map<string, ResolvedLocation>> {
  await connectToDatabase();
  const useLLM = opts.useLLM ?? true;
  const model = opts.model ?? "gpt-4o-mini";

  // Rules pass (also produces the canonical raw key for each input).
  const byRaw = new Map<string, NormalizedLocation>();
  for (const input of rawInputs) {
    const n = normalizeLocation(input);
    if (n.raw) byRaw.set(n.raw, n);
  }
  const raws = [...byRaw.keys()];
  const result = new Map<string, ResolvedLocation>();
  if (raws.length === 0) return result;

  // 1) cache
  const cached = await LocationAlias.find({ raw: { $in: raws } }).lean();
  for (const c of cached as any[]) {
    if (opts.ignoreRulesCache && c.source === "rules") continue;
    result.set(c.raw, { city: c.city, country: c.country, region: c.region || undefined, remote: !!c.remote, source: c.source, confidence: c.confidence });
  }

  // 2) rules for the rest; confident answers are cached
  const residue: string[] = [];
  const toCache: any[] = [];
  for (const raw of raws) {
    if (result.has(raw)) continue;
    const n = byRaw.get(raw)!;
    const r = fromNormalized(n, "rules");
    result.set(raw, r);
    if (n.confidence !== "low") toCache.push({ raw, ...r });
    else residue.push(raw);
  }

  // 3) LLM for the residue (and for rules answers that found no country)
  if (useLLM && residue.length) {
    const llm = await resolveWithLLM(residue, model);
    for (const [raw, r] of llm) {
      result.set(raw, r);
      toCache.push({ raw, ...r });
    }
  }

  if (toCache.length) {
    await LocationAlias.bulkWrite(
      toCache.map((d) => ({
        updateOne: {
          filter: { raw: d.raw },
          update: { $set: { city: d.city, country: d.country, region: d.region || "", remote: d.remote, source: d.source, confidence: d.confidence } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }
  return result;
}

/** Key for looking a posting up in the map returned by resolveRawLocations. */
export function rawKey(input: { city?: string; country?: string }): string {
  return normalizeLocation(input).raw;
}
