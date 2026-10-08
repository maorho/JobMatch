import type { NextRequest } from "next/server";

/**
 * Social login (Google, Facebook) as plain OAuth 2.0 — no extra auth
 * framework: the callback ends by issuing the app's own `token` JWT cookie,
 * exactly like /api/auth/login, so every route keeps working unchanged.
 *
 * Required env: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET,
 *               FACEBOOK_APP_ID + FACEBOOK_APP_SECRET.
 * Optional: APP_URL (public origin, e.g. https://job-match-six.vercel.app);
 * otherwise the request origin is used. Register the callback URL
 *   {origin}/api/auth/oauth/{provider}/callback
 * in each provider's console.
 */
export type Provider = "google" | "facebook";

export type OAuthProfile = {
  provider: Provider;
  providerId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatar?: string;
};

type ProviderConfig = {
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  fetchProfile: (accessToken: string) => Promise<OAuthProfile>;
};

const json = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 120)}`);
  }
};

export const PROVIDERS: Record<Provider, ProviderConfig> = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    async fetchProfile(accessToken) {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`);
      const p = await json(res);
      return {
        provider: "google",
        providerId: String(p.sub || ""),
        email: String(p.email || "").toLowerCase(),
        emailVerified: p.email_verified === true,
        name: String(p.name || ""),
        avatar: typeof p.picture === "string" ? p.picture : undefined,
      };
    },
  },
  facebook: {
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    scope: "email public_profile",
    clientId: () => process.env.FACEBOOK_APP_ID,
    clientSecret: () => process.env.FACEBOOK_APP_SECRET,
    async fetchProfile(accessToken) {
      const url = new URL("https://graph.facebook.com/me");
      url.searchParams.set("fields", "id,name,email,picture.type(large)");
      url.searchParams.set("access_token", accessToken);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Facebook profile failed: ${res.status}`);
      const p = await json(res);
      return {
        provider: "facebook",
        providerId: String(p.id || ""),
        email: String(p.email || "").toLowerCase(),
        // Facebook only returns emails it has verified.
        emailVerified: !!p.email,
        name: String(p.name || ""),
        avatar: p.picture?.data?.url,
      };
    },
  },
};

export function isProvider(s: string): s is Provider {
  return s === "google" || s === "facebook";
}

export function isConfigured(provider: Provider): boolean {
  const c = PROVIDERS[provider];
  return !!(c.clientId() && c.clientSecret());
}

/** Public origin for building redirect URIs (APP_URL wins behind proxies). */
export function appOrigin(req: NextRequest): string {
  const fromEnv = (process.env.APP_URL || "").replace(/\/$/, "");
  return fromEnv || req.nextUrl.origin;
}

export function redirectUri(req: NextRequest, provider: Provider): string {
  return `${appOrigin(req)}/api/auth/oauth/${provider}/callback`;
}

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

export function buildAuthorizeUrl(provider: Provider, params: { redirectUri: string; state: string }): string {
  const c = PROVIDERS[provider];
  const url = new URL(c.authUrl);
  url.searchParams.set("client_id", c.clientId() || "");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", c.scope);
  url.searchParams.set("state", params.state);
  if (provider === "google") {
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
  }
  return url.toString();
}

/** Exchange the authorization code for an access token. */
export async function exchangeCode(provider: Provider, code: string, redirectUriValue: string): Promise<string> {
  const c = PROVIDERS[provider];
  const body = new URLSearchParams({
    client_id: c.clientId() || "",
    client_secret: c.clientSecret() || "",
    code,
    redirect_uri: redirectUriValue,
    grant_type: "authorization_code",
  });
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
  });
  const data = await json(res);
  if (!res.ok || !data.access_token) {
    throw new Error(`Token exchange failed: ${data.error_description || data.error?.message || data.error || res.status}`);
  }
  return String(data.access_token);
}

export async function fetchProfile(provider: Provider, accessToken: string): Promise<OAuthProfile> {
  const profile = await PROVIDERS[provider].fetchProfile(accessToken);
  if (!profile.providerId) throw new Error("Provider returned no user id");
  if (!profile.email) throw new Error("Provider returned no email (grant email access)");
  return profile;
}
