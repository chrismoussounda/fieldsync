import { useSyncExternalStore } from "react";
import { stored } from "./stored.ts";

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

const theme = stored<Theme>("fieldsync.theme", THEMES, "system");
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function apply() {
	const choice = theme.get();
	const dark = choice === "dark" || (choice === "system" && systemDark.matches);
	document.documentElement.classList.toggle("dark", dark);
}

apply();
theme.subscribe(apply);
systemDark.addEventListener("change", apply);

export const setTheme = theme.set;
export const useTheme = () => useSyncExternalStore(theme.subscribe, theme.get);
