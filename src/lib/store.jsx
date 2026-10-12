import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { STORAGE_KEY, load, mergePlan, normalise, save } from "./storage.js";

const StoreContext = createContext(null);

/**
 * One in-memory copy of the document, written back to localStorage after
 * each change (debounced so typing doesn't write on every keystroke).
 */
export function StoreProvider({ children }) {
  const [data, setData] = useState(load);
  const [saveError, setSaveError] = useState(false);
  const timer = useRef(null);
  const latest = useRef(data);
  latest.current = data;

  const fromOtherPage = useRef(false);

  useEffect(() => {
    clearTimeout(timer.current);
    if (fromOtherPage.current) { fromOtherPage.current = false; return undefined; }
    timer.current = setTimeout(() => setSaveError(!save(latest.current)), 300);
    return () => clearTimeout(timer.current);
  }, [data]);

  // The diary and the plan editor are separate pages on the same storage: when
  // one of them writes, the other takes the new document instead of later
  // saving its stale copy over it.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const next = normalise(JSON.parse(e.newValue));
        clearTimeout(timer.current);
        fromOtherPage.current = true;
        setData(next);
      } catch { /* unreadable: keep what we have */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Flush immediately when the app goes to the background.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden") save(latest.current); };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  /** Shallow-merge `patch` into data[collection][key]; empty values are dropped. */
  const patch = useCallback((collection, key, values) => {
    setData((d) => {
      const prev = d[collection][key] || {};
      const next = { ...prev, ...values };
      for (const k of Object.keys(next)) if (next[k] === "" || next[k] === null || next[k] === undefined) delete next[k];
      const coll = { ...d[collection] };
      if (Object.keys(next).length) coll[key] = next; else delete coll[key];
      return { ...d, [collection]: coll };
    });
  }, []);

  const setProfile = useCallback((values) => setData((d) => ({ ...d, profile: { ...d.profile, ...values } })), []);
  const setPrefs = useCallback((values) => setData((d) => ({ ...d, prefs: { ...d.prefs, ...values } })), []);
  const replaceAll = useCallback((next) => { setData(next); save(next); }, []);
  const importPlan = useCallback((incoming) => setData((d) => { const next = mergePlan(d, incoming); save(next); return next; }), []);
  const markBackup = useCallback(() => setData((d) => ({ ...d, meta: { ...d.meta, lastBackup: new Date().toISOString() } })), []);

  const value = useMemo(
    () => ({ data, patch, setProfile, setPrefs, replaceAll, importPlan, markBackup, saveError }),
    [data, patch, setProfile, setPrefs, replaceAll, importPlan, markBackup, saveError]
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}
