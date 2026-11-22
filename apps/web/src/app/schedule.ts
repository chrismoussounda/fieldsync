import { addDays, isFinished } from "../filters.ts";
import type { Order } from "../orders.ts";

/** The Monday of the week holding `date`, both YYYY-MM-DD. */
export function weekOf(date: string): string {
	const [y, m, d] = date.split("-").map(Number);
	const day = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).getDay();
	return addDays(date, -((day + 6) % 7));
}

export const daysFrom = (start: string, count = 7) =>
	Array.from({ length: count }, (_, i) => addDays(start, i));

/** A cell of the board: one technician (or nobody) on one day. */
export const cellKey = (assigneeId: string | null, day: string) =>
	`${assigneeId ?? ""}|${day}`;

export type Board = {
	/** Jobs by cell, in their list order. */
	cells: Map<string, Order[]>;
	/** Unfinished jobs with no date: to be planned. */
	unplanned: Order[];
};

/** Lays the jobs out by technician and day for the given days. */
export function boardOf(orders: Order[], days: string[]): Board {
	const shown = new Set(days);
	const cells = new Map<string, Order[]>();
	const unplanned: Order[] = [];
	for (const order of orders) {
		if (!order.dueDate) {
			if (!isFinished(order)) unplanned.push(order);
			continue;
		}
		if (!shown.has(order.dueDate)) continue;
		const key = cellKey(order.assigneeId, order.dueDate);
		cells.set(key, [...(cells.get(key) ?? []), order]);
	}
	return { cells, unplanned };
}

export type Slot = { assigneeId: string | null; dueDate: string | null };

/**
 * The change that moves a job to a technician and a day; empty when it
 * stays put. Giving an open job to someone assigns it, and taking an
 * assigned job back reopens it; started or finished jobs keep their status.
 */
export function moveOf(order: Order, to: Slot): Record<string, string | null> {
	const patch: Record<string, string | null> = {};
	if (to.assigneeId !== order.assigneeId) patch.assigneeId = to.assigneeId;
	if (to.dueDate !== order.dueDate) patch.dueDate = to.dueDate;
	if ("assigneeId" in patch) {
		if (order.status === "open" && to.assigneeId) patch.status = "assigned";
		if (order.status === "assigned" && !to.assigneeId) patch.status = "open";
	}
	return patch;
}

/** Finished jobs stay where they were done. */
export const canMove = (order: Order) => !isFinished(order);
