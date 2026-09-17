import { appOrigin } from "./auth-cookies";

/**
 * Messages written outside a request (reminders from the scheduler, notification emails) still need absolute
 * links. Every API call leaves the address the portal was reached at here; APP_URL or the Email page override it.
 */
export function rememberOrigin(request) {
  try {
    const origin = appOrigin(request);
    if (/^https?:\/\/[^/]+$/.test(origin)) globalThis.__portalOrigin = origin;
  } catch {}
}
export const lastOrigin = () => globalThis.__portalOrigin || "";
