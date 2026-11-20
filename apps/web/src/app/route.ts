import { useSyncExternalStore } from "react";

export type Route =
	| { name: "list" }
	| { name: "new" }
	| { name: "debug" }
	| { name: "conflicts" }
	| { name: "devices" }
	| { name: "team" }
	| { name: "account" }
	| { name: "order"; id: string };

const PAGES = ["new", "debug", "conflicts", "devices", "team", "account"];

export function parseRoute(hash: string): Route {
	const page = hash.slice(2);
	if (hash.startsWith("#/") && PAGES.includes(page)) {
		return { name: page } as Route;
	}
	const order = /^#\/orders\/([0-9a-f-]{36})$/.exec(hash);
	if (order?.[1]) return { name: "order", id: order[1] };
	return { name: "list" };
}

const subscribe = (listener: () => void) => {
	window.addEventListener("hashchange", listener);
	return () => window.removeEventListener("hashchange", listener);
};

export function useRoute(): Route {
	const hash = useSyncExternalStore(subscribe, () => window.location.hash);
	return parseRoute(hash);
}

export const ROUTES = {
	list: "#/",
	new: "#/new",
	debug: "#/debug",
	conflicts: "#/conflicts",
	devices: "#/devices",
	team: "#/team",
	account: "#/account",
	order: (id: string) => `#/orders/${id}`,
};
