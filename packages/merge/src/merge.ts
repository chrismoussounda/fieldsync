import { decode } from "@fieldsync/hlc";
import type { Op } from "@fieldsync/protocol";

export type EntityState = {
	fields: Op["patch"];
	// Per field, the clock of the write that last won.
	clocks: Record<string, string>;
	createdHlc: string;
	deletedHlc: string | null;
	restoredHlc: string | null;
};

type Value = Op["patch"][string];

export type Conflict = {
	opId: string;
	field: string;
	reason: "concurrent_edit" | "edit_on_deleted";
	winner: { value: Value | null; hlc: string };
	loser: { value: Value | null; hlc: string };
};

export type MergeResult = {
	state: EntityState;
	won: Op["patch"];
	conflicts: Conflict[];
};

export function merge(
	prev: EntityState | null,
	op: Op,
	options = { detectConflicts: true },
): MergeResult {
	const state: EntityState = prev
		? structuredClone(prev)
		: {
				fields: {},
				clocks: {},
				createdHlc: op.hlc,
				deletedHlc: null,
				restoredHlc: null,
			};
	const won: Op["patch"] = {};
	const conflicts: Conflict[] = [];

	// The earliest clock, not the first one seen, so arrival order cannot change it.
	if (op.hlc < state.createdHlc) state.createdHlc = op.hlc;

	if (op.kind === "delete") {
		state.deletedHlc = later(state.deletedHlc, op.hlc);
		return { state, won, conflicts };
	}
	if (op.kind === "restore") {
		state.restoredHlc = later(state.restoredHlc, op.hlc);
		return { state, won, conflicts };
	}

	// Fields merge even while the entity is deleted: skipping them would make
	// the result depend on whether the edit or the delete arrived first.
	const deletedBy = isDeleted(state) ? state.deletedHlc : null;
	for (const [field, value] of Object.entries(op.patch)) {
		const current = state.clocks[field];
		if (current === op.hlc) continue;
		const mine = { value, hlc: op.hlc };
		const wins = current === undefined || op.hlc > current;

		if (options.detectConflicts) {
			if (deletedBy && byAnotherDevice(deletedBy, op)) {
				conflicts.push({
					opId: op.opId,
					field,
					reason: "edit_on_deleted",
					winner: { value: null, hlc: deletedBy },
					loser: mine,
				});
			} else if (
				current !== undefined &&
				current !== op.base[field] &&
				byAnotherDevice(current, op)
			) {
				const theirs = { value: state.fields[field] ?? null, hlc: current };
				conflicts.push({
					opId: op.opId,
					field,
					reason: "concurrent_edit",
					winner: wins ? mine : theirs,
					loser: wins ? theirs : mine,
				});
			}
		}

		if (!wins) continue;
		state.fields[field] = value;
		state.clocks[field] = op.hlc;
		won[field] = value;
	}
	return { state, won, conflicts };
}

export function isDeleted(state: EntityState): boolean {
	if (state.deletedHlc === null) return false;
	return state.restoredHlc === null || state.deletedHlc > state.restoredHlc;
}

function later(current: string | null, hlc: string): string {
	return current !== null && current > hlc ? current : hlc;
}

// A device's own writes can arrive late or out of order; that is not a conflict.
function byAnotherDevice(hlc: string, op: Op): boolean {
	return decode(hlc).node !== decode(op.hlc).node;
}
