import { type EntityState, isDeleted } from "@fieldsync/merge";
import { SITE, WORK_ORDER } from "@fieldsync/work-orders";
import { type Order, toOrder } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";

export type Site = {
	id: string;
	name: string;
	address: string;
	contactName: string;
	contactPhone: string;
	accessNotes: string;
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

export const telLink = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;
