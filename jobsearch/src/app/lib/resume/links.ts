/**
 * Links in résumé text: URLs, bare domains people write on CVs
 * ("linkedin.com/in/handle", "github.com/handle", "myportfolio.dev") and
 * e-mail addresses. One rule for the PDF renderer (which makes them
 * clickable) and the uploader (which keeps them in the text).
 */
const TRAIL = /[.,;:)\]'"»]+$/;
const LEAD = /^[(\['"«]+/;
const HOSTS = /^(?:www\.)?(?:[a-z0-9-]+\.)+(?:com|io|dev|net|org|ai|me|co|app|tech|xyz|il|co\.il|org\.il|ac\.il|gg|sh|so|to|info)(?:[/?#].*)?$/i;
const EMAIL = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/;

/** The token without its surrounding punctuation, and the href it points at; null when it isn't a link. */
export function linkOf(token: string): { text: string; href: string } | null {
  const text = (token || "").replace(LEAD, "").replace(TRAIL, "");
  if (text.length < 5 || /\s/.test(text)) return null;
  if (/^mailto:/i.test(text)) return { text, href: text };
  if (EMAIL.test(text)) return { text, href: `mailto:${text}` };
  if (/^https?:\/\//i.test(text)) return { text, href: text };
  if (HOSTS.test(text) && !/^\d+(\.\d+)+$/.test(text)) return { text, href: `https://${text}` };
  return null;
}

/** Every link in a text, in order, de-duplicated by href. */
export function findLinks(text: string): { text: string; href: string }[] {
  const out: { text: string; href: string }[] = [];
  const seen = new Set<string>();
  for (const tok of (text || "").split(/\s+/)) {
    const l = linkOf(tok);
    if (l && !seen.has(l.href.toLowerCase())) {
      seen.add(l.href.toLowerCase());
      out.push(l);
    }
  }
  return out;
}
