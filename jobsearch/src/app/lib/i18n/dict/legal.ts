/**
 * UI strings for the legal area. Keys are prefixed "legal."; `en` must have exactly the keys of `he`.
 *
 * The legal pages (PrivacyPolicy, Accessibility, TermsOfConditions) are server components with
 * `metadata`, so they cannot call `useT`; all their text, headers included, is written twice inside
 * `<Bilingual he=… en=…>` in the page files themselves. Add keys here only for strings a client
 * component in the legal area needs.
 */
export const he = {
} as const;

export const en: Record<keyof typeof he, string> = {
};
