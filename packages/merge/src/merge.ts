import type { Op } from "@fieldsync/protocol";

export type EntityState = {
	fields: Op["patch"];
	// Per field, the clock of the write that last won.
	clocks: Record<string, string>;
	createdHlc: string;
};

export type MergeResult = {
	state: EntityState;
	won: Op["patch"];
};

export function merge(prev: EntityState | null, op: Op): MergeResult {
	const state: EntityState = prev
		? structuredClone(prev)
		: { fields: {}, clocks: {}, createdHlc: op.hlc };
	const won: Op["patch"] = {};

	// The earliest clock, not the first one seen, so arrival order cannot change it.
	if (op.hlc < state.createdHlc) state.createdHlc = op.hlc;

	for (const [field, value] of Object.entries(op.patch)) {
		const current = state.clocks[field];
		if (current !== undefined && op.hlc <= current) continue;
		state.fields[field] = value;
		state.clocks[field] = op.hlc;
		won[field] = value;
	}
	return { state, won };
}
