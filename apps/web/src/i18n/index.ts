import i18n from "i18next";
import { useSyncExternalStore } from "react";
import { initReactI18next } from "react-i18next";
import { stored } from "../lib/stored.ts";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

export const LANGUAGES = ["fr", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

declare module "i18next" {
	interface CustomTypeOptions {
		resources: { translation: typeof fr };
	}
}

const language = stored<Language>("fieldsync.language", LANGUAGES, "fr");

await i18n.use(initReactI18next).init({
	resources: { fr: { translation: fr }, en: { translation: en } },
	lng: language.get(),
	fallbackLng: "fr",
	interpolation: { escapeValue: false },
});
document.documentElement.lang = language.get();

language.subscribe(() => {
	document.documentElement.lang = language.get();
	void i18n.changeLanguage(language.get());
});

export const setLanguage = language.set;
export const useLanguage = () =>
	useSyncExternalStore(language.subscribe, language.get);
