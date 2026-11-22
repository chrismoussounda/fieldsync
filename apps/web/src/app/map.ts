import type { Location } from "@fieldsync/work-orders";
import { isFinished } from "../filters.ts";
import { byUrgency, type Order } from "../orders.ts";
import type { Site } from "./sites.ts";

export const ALL = "all";

export type MapFilters = {
	/** "active" leaves out finished work, "all" keeps every status. */
	status: string;
	/** "all", "none" or a member id. */
	assignee: string;
	/** A YYYY-MM-DD due date, or "" for any day. */
	day: string;
};

export type Pin = { order: Order; location: Location };

/** Where a job is: its own pin, else the pin of its site. */
export function placeOf(
	order: Order,
	sites: ReadonlyMap<string, Site>,
): Location | null {
	return (
		order.location ??
		(order.siteId ? (sites.get(order.siteId)?.location ?? null) : null)
	);
}

function kept(o: Order, f: MapFilters): boolean {
	if (
		f.status === "active"
			? isFinished(o)
			: f.status !== ALL && o.status !== f.status
	) {
		return false;
	}
	if (
		f.assignee === "none"
			? o.assigneeId !== null
			: f.assignee !== ALL && o.assigneeId !== f.assignee
	) {
		return false;
	}
	return !f.day || o.dueDate === f.day;
}

/** The filtered jobs, split into those with a place on the map and those without. */
export function jobsOnMap(
	orders: readonly Order[],
	sites: ReadonlyMap<string, Site>,
	filters: MapFilters,
): { pinned: Pin[]; unpinned: Order[] } {
	const pinned: Pin[] = [];
	const unpinned: Order[] = [];
	for (const order of orders.filter((o) => kept(o, filters)).sort(byUrgency)) {
		const location = placeOf(order, sites);
		if (location) pinned.push({ order, location });
		else unpinned.push(order);
	}
	return { pinned, unpinned };
}
