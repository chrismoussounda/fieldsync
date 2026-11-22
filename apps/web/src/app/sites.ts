import { type EntityState, isDeleted } from "@fieldsync/merge";
import {
	isLocation,
	type Location,
	SITE,
	WORK_ORDER,
} from "@fieldsync/work-orders";
import { type Order, toOrder } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";

export type Site = {
	id: string;
	name: string;
	address: string;
	contactName: string;
	contactPhone: string;
	accessNotes: string;
	location: Location | null;
};

/** Reads a stored record as a site; null once it is deleted. */
export function toSite(id: string, state: EntityState): Site | null {
	if (isDeleted(state)) return null;
	const text = (v: unknown) => (typeof v === "string" ? v : "");
	const f = state.fields;
	return {
		id,
		name: text(f.name) || "Unnamed site",
		address: text(f.address),
		contactName: text(f.contactName),
		contactPhone: text(f.contactPhone),
		accessNotes: text(f.accessNotes),
		location: isLocation(f.location) ? f.location : null,
	};
}

export async function sitesOf(db: LocalDb): Promise<Site[]> {
	const rows = await db.ofType(SITE);
	return rows
		.flatMap((r) => toSite(r.id, r.state) ?? [])
		.sort((a, b) => a.name.localeCompare(b.name));
}

const finished = (o: Order) =>
	o.status === "done" || o.status === "cancelled" ? 1 : 0;

/** The orders filed at a site: unfinished first, then the latest due. */
export async function jobsAt(db: LocalDb, siteId: string): Promise<Order[]> {
	const rows = await db.ofType(WORK_ORDER);
	return rows
		.flatMap((r) => toOrder(r.id, r.state) ?? [])
		.filter((o) => o.siteId === siteId)
		.sort(
			(a, b) =>
				finished(a) - finished(b) ||
				(b.dueDate ?? "").localeCompare(a.dueDate ?? ""),
		);
}

/** How many unfinished orders each site has. */
export async function openJobsBySite(
	db: LocalDb,
): Promise<Map<string, number>> {
	const counts = new Map<string, number>();
	for (const r of await db.ofType(WORK_ORDER)) {
		const order = toOrder(r.id, r.state);
		if (!order?.siteId || finished(order)) continue;
		counts.set(order.siteId, (counts.get(order.siteId) ?? 0) + 1);
	}
	return counts;
}

export const telLink = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;
