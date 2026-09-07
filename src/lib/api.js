/** Small fetch wrapper for the JSON API under /api. */
export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(url, { method = "GET", body, formData, signal } = {}) {
  const init = { method, signal, headers: {} };
  if (formData) {
    init.body = formData;
  } else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/") && !payload?.details?.needs && !window.location.pathname.startsWith("/login")) {
      const next = window.location.pathname + window.location.search;
      // full reload on purpose: the server layout must re-run and client state must reset
      window.location.href = new URL(`/login?next=${encodeURIComponent(next)}&reason=expired`, window.location.origin).href;
    }
    throw new ApiError(payload?.error || res.statusText || "Request failed", res.status, payload?.details);
  }
  return payload?.data ?? payload;
}

export const api = {
  get: (url, opts) => request(url, { ...opts, method: "GET" }),
  post: (url, body, opts) => request(url, { ...opts, method: "POST", body }),
  put: (url, body, opts) => request(url, { ...opts, method: "PUT", body }),
  patch: (url, body, opts) => request(url, { ...opts, method: "PATCH", body }),
  del: (url, opts) => request(url, { ...opts, method: "DELETE" }),
  upload: (url, formData, opts) => request(url, { ...opts, method: "POST", formData }),
};
