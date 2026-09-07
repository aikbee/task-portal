"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api";

/**
 * Fetch JSON from the API; re-runs when `url` changes or refetch() is called.
 * `loading` is derived (no setState in the effect body); previous data is kept
 * while a new request is in flight so lists don't flash empty.
 */
export function useFetch(url, { enabled = true } = {}) {
  const [tick, setTick] = useState(0);
  const key = url && enabled ? `${url}#${tick}` : null;
  const [state, setState] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    if (!key) return;
    let alive = true;
    api
      .get(url)
      .then((data) => alive && setState({ key, data, error: null }))
      .catch((error) => alive && setState((s) => ({ key, data: s.data, error })));
    return () => {
      alive = false;
    };
  }, [key, url]);

  const loading = Boolean(key) && state.key !== key;
  const setData = useCallback((upd) => setState((s) => ({ ...s, data: typeof upd === "function" ? upd(s.data) : upd })), []);
  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { data: state.data, setData, loading, error: state.key === key ? state.error : null, refetch };
}

export function useDebouncedValue(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Calls handler when a click happens outside of ref. */
export function useClickOutside(ref, handler, active = true) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) handler(e);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [ref, handler, active]);
}

const noopSubscribe = () => () => {};
/** true after hydration, false during SSR — without an effect/setState. */
export function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** True when the media query matches; false during SSR and until hydration. */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query]
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
