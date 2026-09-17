"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { api } from "./api";
import { usePrefs } from "./store";
import { modulesForRole } from "./modules";

const AuthContext = createContext(null);

/** Provides the signed-in user (resolved server-side in the layout) to the client tree. */
export function AuthProvider({ user, children }) {
  const [current, setCurrent] = useState(user);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {}
    try {
      usePrefs.getState().set({ locked: false }); // signing in again requires the password, which outranks the PIN
    } catch {}
    // full reload on purpose: clears client state and lets the proxy/layout re-run
    window.location.href = new URL("/login", window.location.origin).href;
  }, []);

  const switchProfile = useCallback(async (profileId, href) => {
    await api.post(`/api/profiles/${profileId}/activate`);
    window.location.assign(new URL(href || window.location.pathname, window.location.origin).toString());
  }, []);

  const value = useMemo(
    () => ({ user: current, setUser: setCurrent, isAdmin: current?.role === "admin", logout, switchProfile }),
    [current, logout, switchProfile]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const EMPTY = { user: null, isAdmin: false, logout: () => {}, setUser: () => {}, switchProfile: () => {} };
export function useAuth() {
  return useContext(AuthContext) ?? EMPTY;
}

/** Modules the signed-in user may see (admin-only modules are hidden from users; the Info vault is never shared). */
export function useVisibleModules() {
  const { user } = useAuth();
  const member = Boolean(user?.access && user.access !== "owner");
  const mayDelete = !member || user.access === "manager"; // the recycle bin goes with the right to delete
  return useMemo(() => modulesForRole(user?.role).filter((m) => !(member && m.key === "info") && !(m.key === "trash" && !mayDelete)), [user?.role, member, mayDelete]);
}

/**
 * What the user may do in the active profile. In their own profiles everything; in a profile somebody shared
 * with them it follows their role (the server enforces the same rules, this only keeps dead buttons off the screen).
 */
export function useAccess() {
  const { user } = useAuth();
  const access = user?.access ?? "owner";
  const shared = user?.shared ?? null;
  return useMemo(() => ({ access, shared, isOwner: access === "owner", canEdit: access !== "viewer", canDelete: access === "owner" || access === "manager" }), [access, shared]);
}
/** Renders its children only for people who may create and edit in the active profile. */
export function CanEdit({ children, fallback = null }) {
  return useAccess().canEdit ? children : fallback;
}
/** Renders its children only for people who may delete whole records (owner and managers). */
export function CanDelete({ children, fallback = null }) {
  return useAccess().canDelete ? children : fallback;
}
