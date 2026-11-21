import { isDeleted } from "@fieldsync/merge";
import { minutesBetween, TIME_ENTRY } from "@fieldsync/work-orders";
import type { LocalDb } from "../sync/storage.ts";

export type Entry = {
	id: string;
	orderId: string;
	technicianId: string;
	startedAt: string;
	endedAt: string | null;
};

/** The time entries this device holds, oldest first; deleted ones left out. */
export async function entriesOf(
	db: LocalDb,
	orderId?: string,
): Promise<Entry[]> {
	const rows = await db.ofType(TIME_ENTRY);
	return rows
		.filter((r) => !isDeleted(r.state))
		.map((r): Entry => {
			const f = r.state.fields;
			const text = (v: unknown) => (typeof v === "string" ? v : "");
			return {
				id: r.id,
				orderId: text(f.orderId),
				technicianId: text(f.technicianId),
				startedAt: text(f.startedAt),
				endedAt: text(f.endedAt) || null,
			};
		})
		.filter((e) => e.startedAt && (!orderId || e.orderId === orderId))
		.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Minutes per technician for entries started since `since`, running ones up to `now`. */
export function minutesByTechnician(
	entries: Entry[],
	since: number,
	now: number,
): Map<string, number> {
	const totals = new Map<string, number>();
	for (const e of entries) {
		if (Date.parse(e.startedAt) < since) continue;
		const minutes = minutesBetween(e.startedAt, e.endedAt, now);
		totals.set(e.technicianId, (totals.get(e.technicianId) ?? 0) + minutes);
	}
	return totals;
}
