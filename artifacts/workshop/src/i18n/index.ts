import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./ar.json";
import en from "./en.json";

const STORAGE_KEY = "wf_lang";

export type Lang = "ar" | "en";

export function getSavedLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "ar" || saved === "en") return saved;
  return "ar";
}

export function applyLang(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  localStorage.setItem(STORAGE_KEY, lang);
}

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: getSavedLang(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

applyLang(getSavedLang());

export default i18n;
