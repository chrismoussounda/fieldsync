import { isDeleted } from "@fieldsync/merge";
import { PART } from "@fieldsync/work-orders";
import type { LocalDb } from "../sync/storage.ts";

export type Part = {
	id: string;
	orderId: string;
	name: string;
	quantity: number;
	unit: string | null;
	addedBy: string;
	addedAt: string;
};

/** The parts this device holds, oldest first; deleted ones left out. */
export async function partsOf(db: LocalDb, orderId?: string): Promise<Part[]> {
	const rows = await db.ofType(PART);
	return rows
		.filter((r) => !isDeleted(r.state))
		.map((r): Part => {
			const f = r.state.fields;
			const text = (v: unknown) => (typeof v === "string" ? v : "");
			return {
				id: r.id,
				orderId: text(f.orderId),
				name: text(f.name),
				quantity: typeof f.quantity === "number" ? f.quantity : 0,
				unit: text(f.unit) || null,
				addedBy: text(f.addedBy),
				addedAt: text(f.addedAt),
			};
		})
		.filter((p) => !orderId || p.orderId === orderId)
		.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

/** Names used before, the most used first, to suggest while typing. */
export function partNames(parts: Part[]): string[] {
	const counts = new Map<string, number>();
	for (const p of parts) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
	return [...counts]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([name]) => name);
}

/** "2 pcs", "1.5 m", "3". */
export const formatQuantity = (p: Pick<Part, "quantity" | "unit">) =>
	p.unit ? `${p.quantity} ${p.unit}` : String(p.quantity);
