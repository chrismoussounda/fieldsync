import { minutesBetween, SITE, WORK_ORDER } from "@fieldsync/work-orders";
import { type Order, toOrder } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";
import { type Item, itemsOf } from "./checklists.ts";
import { type Part, partsOf } from "./parts.ts";
import { type Photo, photosOf } from "./photos.ts";
import { type Site, toSite } from "./sites.ts";
import { type Entry, entriesOf } from "./timesheet.ts";

/** What the customer gets once the job is done, from this device's copy. */
export type Report = {
	order: Order;
	site: Site | null;
	items: Item[];
	entries: Entry[];
	minutes: number;
	parts: Part[];
	photos: Photo[];
	signature: Photo | null;
};

export async function reportOf(
	db: LocalDb,
	orderId: string,
	now: number,
): Promise<Report | null> {
	const row = await db.entities.get([WORK_ORDER, orderId]);
	const order = row && toOrder(orderId, row.state);
	if (!order) return null;
	const siteRow = order.siteId
		? await db.entities.get([SITE, order.siteId])
		: undefined;
	const entries = await entriesOf(db, orderId);
	const photos = await photosOf(db, orderId);
	return {
		order,
		site: siteRow ? toSite(siteRow.id, siteRow.state) : null,
		items: await itemsOf(db, orderId),
		entries,
		minutes: entries.reduce(
			(sum, e) => sum + minutesBetween(e.startedAt, e.endedAt, now),
			0,
		),
		parts: await partsOf(db, orderId),
		photos: photos.filter((p) => !p.signer),
		// The latest, should the customer have signed again.
		signature: photos.filter((p) => p.signer).at(-1) ?? null,
	};
}
