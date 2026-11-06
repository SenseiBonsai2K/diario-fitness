// Every key this app stores on the phone starts with this prefix. The preview
// build (/prova/) sets another one, so it keeps separate data on the same site.
export const KEY_PREFIX = import.meta.env?.VITE_KEY_PREFIX || "diario-fitness";

/** "diario-fitness:<name>" (or the preview's prefix). */
export const storeKey = (name) => `${KEY_PREFIX}:${name}`;
