import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en/index.js";
import it from "./locales/it/index.js";

export const LANGS = ["it", "en"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en, it },
    supportedLngs: LANGS,
    nonExplicitSupportedLngs: true,
    fallbackLng: "en",
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"], lookupLocalStorage: "diario-fitness:lang" },
  });

i18n.on("languageChanged", (lng) => { document.documentElement.lang = lng; });
document.documentElement.lang = i18n.resolvedLanguage || "en";

export default i18n;
