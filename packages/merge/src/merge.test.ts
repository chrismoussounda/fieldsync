import { describe, expect, it } from "vitest";
import { type EntityState, isDeleted, merge } from "./merge.ts";
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
				deletedHlc: null,
				restoredHlc: null,
			},
			won: { status: "assigned", priority: "normal" },
			conflicts: [],
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

describe("delete", () => {
	it("marks the entity deleted and keeps its fields", () => {
		const state = apply(
			op(PHONE, 1, { patch: { status: "assigned" } }),
			op(OFFICE, 2, { kind: "delete" }),
		);
		expect(isDeleted(state)).toBe(true);
		expect(state.fields).toEqual({ status: "assigned" });
	});

	it("stays deleted when an edit arrives afterwards", () => {
		const state = apply(
			op(PHONE, 1, { patch: { status: "assigned" } }),
			op(OFFICE, 2, { kind: "delete" }),
			op(PHONE, 3, { patch: { status: "completed" } }),
		);
		expect(isDeleted(state)).toBe(true);
	});

	it("gives the same state whether the edit or the delete arrives first", () => {
		const create = op(PHONE, 1, { patch: { status: "assigned" } });
		const edit = op(PHONE, 3, { patch: { status: "completed" } });
		const remove = op(OFFICE, 2, { kind: "delete" });
		expect(apply(create, edit, remove)).toEqual(apply(create, remove, edit));
	});
});

describe("restore", () => {
	const create = op(PHONE, 1, { patch: { status: "assigned" } });

	it("brings back an entity deleted earlier", () => {
		const state = apply(
			create,
			op(OFFICE, 2, { kind: "delete" }),
			op(OFFICE, 3, { kind: "restore" }),
		);
		expect(isDeleted(state)).toBe(false);
		expect(state.fields).toEqual({ status: "assigned" });
	});

	it("loses to a later delete", () => {
		const state = apply(
			create,
			op(OFFICE, 3, { kind: "delete" }),
			op(PHONE, 2, { kind: "restore" }),
		);
		expect(isDeleted(state)).toBe(true);
	});

	it("gives the same state whether the restore or the delete arrives first", () => {
		const remove = op(OFFICE, 2, { kind: "delete" });
		const restore = op(OFFICE, 3, { kind: "restore" });
		expect(apply(create, restore, remove)).toEqual(
			apply(create, remove, restore),
		);
	});
});

describe("conflicts", () => {
	const create = op(PHONE, 1, { patch: { status: "assigned" } });
	const seen = { status: create.hlc };

	it("reports nothing when the user saw the value they replaced", () => {
		const edit = op(OFFICE, 2, { patch: { status: "cancelled" }, base: seen });
		expect(merge(apply(create), edit).conflicts).toEqual([]);
	});

	it("reports an edit that overrides one the user never saw", () => {
		const office = op(OFFICE, 2, {
			patch: { status: "cancelled" },
			base: seen,
		});
		const phone = op(PHONE, 3, { patch: { status: "completed" }, base: seen });
		expect(merge(apply(create, office), phone).conflicts).toEqual([
			{
				opId: phone.opId,
				field: "status",
				reason: "concurrent_edit",
				winner: { value: "completed", hlc: phone.hlc },
				loser: { value: "cancelled", hlc: office.hlc },
			},
		]);
	});

	it("reports an edit that loses to one the user never saw", () => {
		const office = op(OFFICE, 3, {
			patch: { status: "cancelled" },
			base: seen,
		});
		const phone = op(PHONE, 2, { patch: { status: "completed" }, base: seen });
		expect(merge(apply(create, office), phone).conflicts).toMatchObject([
			{ winner: { value: "cancelled" }, loser: { value: "completed" } },
		]);
	});

	it("does not report two devices that wrote the same value", () => {
		const office = op(OFFICE, 3, {
			patch: { status: "cancelled" },
			base: seen,
		});
		const phone = op(PHONE, 2, { patch: { status: "cancelled" }, base: seen });
		expect(merge(apply(create, office), phone).conflicts).toEqual([]);
		const here = { lat: -4.27, lng: 15.28 };
		const pinned = op(OFFICE, 3, { patch: { location: here }, base: seen });
		const same = op(PHONE, 4, { patch: { location: { ...here } }, base: seen });
		expect(merge(apply(create, pinned), same).conflicts).toEqual([]);
	});

	it("ignores a device's own writes arriving out of order", () => {
		const second = op(PHONE, 3, { patch: { status: "completed" }, base: seen });
		const first = op(PHONE, 2, {
			patch: { status: "in_progress" },
			base: seen,
		});
		expect(merge(apply(create, second), first).conflicts).toEqual([]);
	});

	it("reports an edit to an entity another device deleted", () => {
		const remove = op(OFFICE, 2, { kind: "delete" });
		const edit = op(PHONE, 3, { patch: { status: "completed" }, base: seen });
		expect(merge(apply(create, remove), edit).conflicts).toEqual([
			{
				opId: edit.opId,
				field: "status",
				reason: "edit_on_deleted",
				winner: { value: null, hlc: remove.hlc },
				loser: { value: "completed", hlc: edit.hlc },
			},
		]);
	});

	it("reports nothing when detection is off", () => {
		const office = op(OFFICE, 2, {
			patch: { status: "cancelled" },
			base: seen,
		});
		const phone = op(PHONE, 3, { patch: { status: "completed" }, base: seen });
		const result = merge(apply(create, office), phone, {
			detectConflicts: false,
		});
		expect(result.conflicts).toEqual([]);
	});
});
