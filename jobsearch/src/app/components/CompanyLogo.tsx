"use client";
import { useState } from "react";
import {
  getLogoUrl,
  getFaviconUrl,
  resolveLogoDomain,
} from "../lib/scout/logo";

interface CompanyLogoProps {
  name: string;
  domain?: string;
  logoUrl?: string;
  /** Sizing/positioning classes — defaults match the old GoogleIcon slot. */
  className?: string;
}

/**
 * Company logo with graceful fallback: stored logoUrl → unavatar → favicon →
 * a neutral letter placeholder. Never renders a broken image.
 */
export default function CompanyLogo({
  name,
  domain,
  logoUrl,
  className = "w-5 h-5 flex-shrink-0",
}: CompanyLogoProps) {
  // Resolve to the company's own domain (ignoring shared ATS hosts like
  // comeet.com), falling back to a name-based guess.
  const d = resolveLogoDomain(domain, name);
  // Ignore stale unavatar.io URLs stored on older jobs — that provider now
  // rate-limits every request (429), so trusting it just wastes the first slot.
  const stored = logoUrl && !/unavatar\.io/i.test(logoUrl) ? logoUrl : "";
  const chain = [stored, getLogoUrl(d), getFaviconUrl(d)].filter(
    Boolean
  ) as string[];
  const [idx, setIdx] = useState(0);

  // Reset the fallback position when the logo identity changes, so a reused
  // instance (e.g. after list filtering) doesn't keep a prior company's state.
  // Done during render (React's "adjust state on prop change" pattern), not
  // in an effect, so there is no extra flicker frame of the old logo.
  const identity = `${name}|${domain ?? ""}|${logoUrl ?? ""}`;
  const [seenIdentity, setSeenIdentity] = useState(identity);
  if (seenIdentity !== identity) {
    setSeenIdentity(identity);
    setIdx(0);
  }

  const letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const src = chain[idx];

  if (!src) {
    return (
      <span
        className={`${className} inline-flex items-center justify-center rounded bg-gray-100 text-gray-500 text-[11px] font-semibold`}
        aria-label={name}
        title={name}
      >
        {letter}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      title={name}
      width={40}
      height={40}
      loading="lazy"
      decoding="async"
      className={`${className} object-contain rounded bg-white`}
      referrerPolicy="no-referrer"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
