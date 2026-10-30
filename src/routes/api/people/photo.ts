import { DefaultAzureCredential, ManagedIdentityCredential } from "@azure/identity";
import { createFileRoute } from "@tanstack/react-router";

const SAFE_EMAIL = /^[A-Za-z0-9._%+\-]+@primeeng\.com$/i;
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 6 * 60 * 60 * 1000;

type CacheHit = { data: ArrayBuffer; type: string; until: number };
type CacheMiss = { miss: true; until: number };
const photoCache = new Map<string, CacheHit | CacheMiss>();

let identityToken: { token: string; expires: number } | null = null;

function inAzure() {
  return Boolean(process.env.WEBSITE_INSTANCE_ID || process.env.IDENTITY_ENDPOINT || process.env.MSI_ENDPOINT);
}

async function identityGraphToken() {
  if (identityToken && identityToken.expires - Date.now() > 60_000) return identityToken.token;
  const cred = inAzure() ? new ManagedIdentityCredential() : new DefaultAzureCredential();
  const next = await cred.getToken(GRAPH_SCOPE);
  if (!next?.token) return null;
  identityToken = { token: next.token, expires: next.expiresOnTimestamp };
  return next.token;
}

async function graphTokens(request: Request) {
  const tokens: string[] = [];
  const user = request.headers.get("x-ms-token-aad-access-token")?.trim();
  if (user) tokens.push(user);
  const fromEnv = process.env.GRAPH_TOKEN?.trim();
  if (fromEnv) tokens.push(fromEnv);
  try {
    const identity = await identityGraphToken();
    if (identity) tokens.push(identity);
  } catch {
    /* local CLI / MI may not have Graph photo consent */
  }
  return tokens;
}

async function graphPhoto(email: string, token: string) {
  const encoded = encodeURIComponent(email);
  const urls = [
    `https://graph.microsoft.com/v1.0/users/${encoded}/photos/64x64/$value`,
    `https://graph.microsoft.com/v1.0/users/${encoded}/photo/$value`,
  ];
  for (const url of urls) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) continue;
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!type.startsWith("image/")) continue;
    const data = await res.arrayBuffer();
    if (!data.byteLength) continue;
    return { data, type };
  }
  return null;
}

export const Route = createFileRoute("/api/people/photo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const email = new URL(request.url).searchParams.get("email")?.trim() ?? "";
        if (!SAFE_EMAIL.test(email)) return new Response(null, { status: 400 });
        const key = email.toLowerCase();
        const cached = photoCache.get(key);
        if (cached && cached.until > Date.now()) {
          if ("miss" in cached) return new Response(null, { status: 404 });
          return new Response(cached.data, {
            headers: {
              "Content-Type": cached.type,
              "Cache-Control": "private, max-age=86400",
            },
          });
        }
        const tokens = await graphTokens(request);
        if (!tokens.length) return new Response(null, { status: 404 });
        try {
          let photo: { data: ArrayBuffer; type: string } | null = null;
          for (const token of tokens) {
            photo = await graphPhoto(key, token);
            if (photo) break;
          }
          if (!photo) {
            photoCache.set(key, { miss: true, until: Date.now() + MISS_TTL_MS });
            return new Response(null, { status: 404 });
          }
          photoCache.set(key, { ...photo, until: Date.now() + HIT_TTL_MS });
          return new Response(photo.data, {
            headers: {
              "Content-Type": photo.type,
              "Cache-Control": "private, max-age=86400",
            },
          });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    },
  },
});
