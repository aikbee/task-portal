import { HttpError } from "./http-error";

/**
 * GIF search behind a server-side key (GIPHY or Tenor), configured by an administrator on the Moderation page.
 * Results are normalised to { id, title, preview, url, width, height }; the chosen GIF is then downloaded by the
 * server and stored like any other photo, so recipients never load anything from the provider.
 */
const GIPHY = "https://api.giphy.com/v1/gifs";
const TENOR = "https://tenor.googleapis.com/v2";
const LIMIT = 24;
export const GIF_MAX_BYTES = 10 * 1024 * 1024;
/** Only the providers' own media hosts may be fetched by the server. */
export const GIF_HOST = /^https:\/\/([a-z0-9-]+\.)*(giphy\.com|tenor\.com)\//i;
export const GIF_PROVIDERS = ["giphy", "tenor"];

export async function searchGifs(settings, q = "", pos = "") {
  const provider = settings?.gif_provider;
  const key = settings?.gif_api_key;
  if (!GIF_PROVIDERS.includes(provider) || !key) return { configured: false, provider: null, items: [], next: null };
  const term = String(q ?? "").trim().slice(0, 80);
  let url;
  if (provider === "giphy") {
    url = new URL(term ? `${GIPHY}/search` : `${GIPHY}/trending`);
    url.searchParams.set("api_key", key);
    url.searchParams.set("limit", String(LIMIT));
    url.searchParams.set("rating", "pg-13");
    if (term) url.searchParams.set("q", term);
    if (pos) url.searchParams.set("offset", String(Number(pos) || 0));
  } else {
    url = new URL(term ? `${TENOR}/search` : `${TENOR}/featured`);
    url.searchParams.set("key", key);
    url.searchParams.set("client_key", "task-portal");
    url.searchParams.set("limit", String(LIMIT));
    url.searchParams.set("media_filter", "gif,tinygif");
    url.searchParams.set("contentfilter", "medium");
    if (term) url.searchParams.set("q", term);
    if (pos) url.searchParams.set("pos", String(pos).slice(0, 64));
  }
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
  } catch {
    throw new HttpError("The GIF service did not answer.", 502);
  }
  if (!res.ok) throw new HttpError(res.status === 401 || res.status === 403 ? "The GIF search key was refused; an administrator should check it." : `GIF search failed (${res.status}).`, 502);
  const json = await res.json();
  if (provider === "giphy") {
    const items = (json.data ?? [])
      .map((g) => ({
        id: String(g.id),
        title: g.title || "",
        preview: g.images?.fixed_width_small?.url || g.images?.fixed_width?.url,
        url: g.images?.downsized?.url || g.images?.fixed_width?.url || g.images?.original?.url,
        width: Number(g.images?.fixed_width?.width) || null,
        height: Number(g.images?.fixed_width?.height) || null,
      }))
      .filter((g) => g.preview && g.url);
    const offset = Number(json.pagination?.offset ?? 0) + items.length;
    const total = Number(json.pagination?.total_count ?? 0);
    return { configured: true, provider, items, next: items.length && offset < total ? String(offset) : null };
  }
  const items = (json.results ?? [])
    .map((r) => ({
      id: String(r.id),
      title: r.content_description || r.title || "",
      preview: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url,
      url: r.media_formats?.gif?.url || r.media_formats?.tinygif?.url,
      width: Number(r.media_formats?.gif?.dims?.[0]) || null,
      height: Number(r.media_formats?.gif?.dims?.[1]) || null,
    }))
    .filter((g) => g.preview && g.url);
  return { configured: true, provider, items, next: json.next || null };
}

/** Download a chosen GIF from the provider (allow-listed hosts only, 10 MB cap). */
export async function fetchGif(url) {
  const src = String(url ?? "");
  if (!GIF_HOST.test(src)) throw new HttpError("GIFs can only come from the configured GIF service.", 400);
  let res;
  try {
    res = await fetch(src, { signal: AbortSignal.timeout(15000), redirect: "follow" });
  } catch {
    throw new HttpError("Could not download that GIF.", 502);
  }
  if (!res.ok || (res.url && !GIF_HOST.test(res.url))) throw new HttpError("Could not download that GIF.", 502);
  if (Number(res.headers.get("content-length")) > GIF_MAX_BYTES) throw new HttpError("That GIF is larger than 10 MB.", 413);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > GIF_MAX_BYTES) throw new HttpError("That GIF is larger than 10 MB.", 413);
  return buf;
}
