// Renders the brand mark (same geometry as src/app/components/Logo.tsx) to the
// raster assets browsers and crawlers need. Run: node scripts/logo-assets.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const RING = "M39.45 28.14A16 16 0 1 1 29.47 8.95";
const DOT = { cx: 31.5, cy: 16.5, r: 6.5 };
const COBALT = "#2f4ad6", NAVY = "#15171f", SKY = "#9db0ff";

const mark = (color) => `<path d="${RING}" fill="none" stroke="${color}" stroke-width="6.5" stroke-linecap="round"/><circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${color}"/>`;
const markSvg = (color, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${bg ? `<rect width="48" height="48" rx="11" fill="${bg}"/>` : ""}${mark(color)}</svg>`;
// App tiles get a little breathing room inside the rounded square.
const tileSvg = (color, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="11" fill="${bg}"/><g transform="translate(5.5 5.5) scale(0.77)">${mark(color)}</g></svg>`;

const png = (svg, size, out) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(out).then(() => console.log("wrote", out));

// Favicon: Next serves src/app/icon.svg and apple-icon.png on its own.
writeFileSync("src/app/icon.svg", markSvg(COBALT));
console.log("wrote src/app/icon.svg");
await png(tileSvg("#fff", COBALT), 180, "src/app/apple-icon.png");
// Kept under their old names for anything that still points at them (JSON-LD publisher logo, old links).
await png(tileSvg("#fff", COBALT), 512, "public/favicon.png");
await png(tileSvg("#fff", COBALT), 1024, "public/jobMatchIcon.png");

// Share card: 1200×630, mark + wordmark on cobalt.
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a56e8"/><stop offset="1" stop-color="#2436a8"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g transform="translate(96 150) scale(6.9)">${mark("#fff")}</g>
  <text x="470" y="318" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700" font-size="128" letter-spacing="-4" fill="#fff">Job<tspan fill="${SKY}">Match</tspan></text>
  <text x="474" y="404" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="40" fill="#dfe5ff">The tech job you're actually a fit for.</text>
  <text x="474" y="462" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="30" fill="#b7c3ff">4,700+ live postings · ranked against your résumé · interview prep built in</text>
</svg>`;
await sharp(Buffer.from(og)).png().toFile("public/og.png").then(() => console.log("wrote public/og.png"));
