import { cookies } from "next/headers";
import { DEFAULT_LANG, LANGS, type Lang } from "./dict";

/** The language for a server component that is already dynamic (reads the "jm_lang" cookie). Static pages pass a language explicitly. */
export async function serverLang(): Promise<Lang> {
  try {
    const v = (await cookies()).get("jm_lang")?.value;
    return v && (LANGS as string[]).includes(v) ? (v as Lang) : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}
