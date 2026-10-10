import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { load, mergePlan, save } from "./storage.js";

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

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaveError(!save(latest.current)), 300);
    return () => clearTimeout(timer.current);
  }, [data]);

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
