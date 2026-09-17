/** "Client X, infra,, INFRA" -> "client-x,infra": lower case, dashes for spaces, unique, at most 20, stored comma separated. */
export function normaliseTags(raw, { max = 20, maxLength = 255 } = {}) {
  if (raw == null) return null;
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,\n]/);
  const tags = list.map((t) => String(t).trim().replace(/^#/, "").replace(/\s+/g, "-").toLowerCase().slice(0, 40)).filter(Boolean);
  let out = [...new Set(tags)].slice(0, max);
  while (out.join(",").length > maxLength) out = out.slice(0, -1);
  return out.join(",") || null;
}
export const tagList = (stored) => String(stored ?? "").split(",").filter(Boolean);
