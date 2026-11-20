import { useSyncExternalStore } from "react";

export type Route =
	| { name: "list" }
	| { name: "new" }
	| { name: "debug" }
	| { name: "conflicts" }
	| { name: "order"; id: string };

export function parseRoute(hash: string): Route {
	if (hash === "#/new") return { name: "new" };
	if (hash === "#/debug") return { name: "debug" };
	if (hash === "#/conflicts") return { name: "conflicts" };
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
	order: (id: string) => `#/orders/${id}`,
};
