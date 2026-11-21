import { isDeleted } from "@fieldsync/merge";
import { CHECKLIST_ITEM } from "@fieldsync/work-orders";
import type { LocalDb } from "../sync/storage.ts";

export type Item = {
	id: string;
	orderId: string;
	label: string;
	position: number;
	done: boolean;
	doneBy: string | null;
	doneAt: string | null;
};

/** The checklist items this device holds, in order; deleted ones left out. */
export async function itemsOf(db: LocalDb, orderId?: string): Promise<Item[]> {
	const rows = await db.ofType(CHECKLIST_ITEM);
	return rows
		.filter((r) => !isDeleted(r.state))
		.map((r): Item => {
			const f = r.state.fields;
			const text = (v: unknown) => (typeof v === "string" ? v : null);
			return {
				id: r.id,
				orderId: text(f.orderId) ?? "",
				label: text(f.label) ?? "",
				position: typeof f.position === "number" ? f.position : 0,
				done: f.done === true,
				doneBy: text(f.doneBy),
				doneAt: text(f.doneAt),
			};
		})
		.filter((i) => !orderId || i.orderId === orderId)
		.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export type Progress = { done: number; total: number };

export function progressByOrder(items: Item[]): Map<string, Progress> {
	const progress = new Map<string, Progress>();
	for (const item of items) {
		const p = progress.get(item.orderId) ?? { done: 0, total: 0 };
		p.total += 1;
		if (item.done) p.done += 1;
		progress.set(item.orderId, p);
	}
	return progress;
}
