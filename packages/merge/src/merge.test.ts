import { describe, expect, it } from "vitest";
import { type EntityState, merge } from "./merge.ts";
import { OFFICE, op, PHONE, stamp } from "./testing.ts";

function apply(...ops: Parameters<typeof merge>[1][]): EntityState {
	let state: EntityState | null = null;
	for (const o of ops) state = merge(state, o).state;
	if (!state) throw new Error("no ops");
	return state;
}

describe("upsert", () => {
	it("creates the entity from the first operation", () => {
		const create = op(PHONE, 1, {
			patch: { status: "assigned", priority: "normal" },
		});
		expect(merge(null, create)).toEqual({
			state: {
				fields: { status: "assigned", priority: "normal" },
				clocks: { status: create.hlc, priority: create.hlc },
				createdHlc: create.hlc,
			},
			won: { status: "assigned", priority: "normal" },
		});
	});

	it("lets a later write win a field", () => {
		const state = apply(
			op(PHONE, 1, { patch: { status: "assigned" } }),
			op(OFFICE, 2, { patch: { status: "cancelled" } }),
		);
		expect(state.fields.status).toBe("cancelled");
	});

	it("drops an earlier write that arrives late", () => {
		const late = op(PHONE, 1, { patch: { status: "in_progress" } });
		const state = apply(op(OFFICE, 2, { patch: { status: "cancelled" } }));
		const result = merge(state, late);
		expect(result.state.fields).toEqual({ status: "cancelled" });
		expect(result.won).toEqual({});
	});

	it("keeps edits to different fields from both devices", () => {
		const state = apply(
			op(PHONE, 1, { patch: { status: "assigned", priority: "normal" } }),
			op(OFFICE, 3, { patch: { priority: "urgent" } }),
			op(PHONE, 2, { patch: { status: "in_progress" } }),
		);
		expect(state.fields).toEqual({ status: "in_progress", priority: "urgent" });
	});

	it("records the earliest clock as the creation time", () => {
		const state = apply(
			op(OFFICE, 5, { patch: { a: 1 } }),
			op(PHONE, 2, { patch: { b: 2 } }),
		);
		expect(state.createdHlc).toBe(stamp(PHONE, 2));
	});

	it("does not mutate the previous state", () => {
		const before = apply(op(PHONE, 1, { patch: { status: "assigned" } }));
		const snapshot = structuredClone(before);
		merge(before, op(OFFICE, 2, { patch: { status: "cancelled" } }));
		expect(before).toEqual(snapshot);
	});
});
