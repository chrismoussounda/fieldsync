import { useSyncExternalStore } from "react";

const query = window.matchMedia("(max-width: 767px)");

const subscribe = (listener: () => void) => {
	query.addEventListener("change", listener);
	return () => query.removeEventListener("change", listener);
};

/** Below Tailwind's `md`: phones get native pickers and bottom drawers. */
export const usePhone = () =>
	useSyncExternalStore(subscribe, () => query.matches);
