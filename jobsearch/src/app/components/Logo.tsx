/**
 * The JobMatch mark: an open ring with a dot entering through the gap.
 * "You're in." One shape, readable from 16px to a billboard, works in a
 * single colour. Inline SVG so it inherits `currentColor` and needs no
 * image request; the raster copies in /public are generated from this
 * same geometry (scripts/logo-assets.mjs).
 */

/** Ring: centre 24,24 r=16, drawn clockwise from 15° to 290° (gap at the top-right). */
export const MARK_RING = "M39.45 28.14A16 16 0 1 1 29.47 8.95";
/** The dot sits in the gap, overlapping the ring's end so it reads as "entering", not as an eye. */
export const MARK_DOT = { cx: 31.5, cy: 16.5, r: 6.5 };

export function LogoMark({ size = 40, className = "", title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <path d={MARK_RING} fill="none" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" />
      <circle cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={MARK_DOT.r} fill="currentColor" />
    </svg>
  );
}

/** Mark + wordmark, for headers and auth pages. `tone` picks the wordmark colours for a dark or light surface. */
export function Logo({ size = 40, tone = "dark", wordmark = true, className = "" }: { size?: number; tone?: "dark" | "light"; wordmark?: boolean; className?: string }) {
  const markColor = tone === "dark" ? "text-white" : "text-teal";
  const word = tone === "dark" ? "text-white" : "text-navy";
  const accent = tone === "dark" ? "text-sky" : "text-teal";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} className={`shrink-0 ${markColor}`} />
      {wordmark && (
        <span className={`font-extrabold leading-none tracking-[-0.02em] ${word}`} style={{ fontSize: Math.round(size * 0.55) }}>
          Job<span className={accent}>Match</span>
        </span>
      )}
    </span>
  );
}
