import type { Op } from "@fieldsync/protocol";

export type EntityState = {
	fields: Op["patch"];
	// Per field, the clock of the write that last won.
	clocks: Record<string, string>;
	createdHlc: string;
	deletedHlc: string | null;
	restoredHlc: string | null;
};

export type MergeResult = {
	state: EntityState;
	won: Op["patch"];
};

export function merge(prev: EntityState | null, op: Op): MergeResult {
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

	// The earliest clock, not the first one seen, so arrival order cannot change it.
	if (op.hlc < state.createdHlc) state.createdHlc = op.hlc;

	if (op.kind === "delete") {
		state.deletedHlc = later(state.deletedHlc, op.hlc);
		return { state, won };
	}
	if (op.kind === "restore") {
		state.restoredHlc = later(state.restoredHlc, op.hlc);
		return { state, won };
	}

	// Fields merge even while the entity is deleted: skipping them would make
	// the result depend on whether the edit or the delete arrived first.
	for (const [field, value] of Object.entries(op.patch)) {
		const current = state.clocks[field];
		if (current !== undefined && op.hlc <= current) continue;
		state.fields[field] = value;
		state.clocks[field] = op.hlc;
		won[field] = value;
	}
	return { state, won };
}

export function isDeleted(state: EntityState): boolean {
	if (state.deletedHlc === null) return false;
	return state.restoredHlc === null || state.deletedHlc > state.restoredHlc;
}

function later(current: string | null, hlc: string): string {
	return current !== null && current > hlc ? current : hlc;
}
