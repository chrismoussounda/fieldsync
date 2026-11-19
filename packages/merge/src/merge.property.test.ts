import type { Op } from "@fieldsync/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type EntityState, merge } from "./merge.ts";
import { OFFICE, op, PHONE, stamp } from "./testing.ts";

const TABLET = "12345678-0000-4000-8000-000000000003";
const FIELDS = ["status", "priority", "notes"];

const anyOp: fc.Arbitrary<Op> = fc
	.record({
		deviceId: fc.constantFrom(PHONE, OFFICE, TABLET),
		wall: fc.integer({ min: 1, max: 20 }),
		kind: fc.constantFrom("upsert", "upsert", "upsert", "delete", "restore"),
		patch: fc.dictionary(
			fc.constantFrom(...FIELDS),
			fc.integer({ min: 0, max: 9 }),
		),
		base: fc.dictionary(
			fc.constantFrom(...FIELDS),
			fc.integer({ min: 1, max: 20 }).map((wall) => stamp(OFFICE, wall)),
		),
	})
	.map(({ deviceId, wall, ...rest }) => op(deviceId, wall, rest));

// A device never issues the same clock twice, so neither do the generated ops.
const ops = fc.uniqueArray(anyOp, { selector: (o) => o.hlc, maxLength: 12 });

function apply(sequence: Op[]): EntityState | null {
	let state: EntityState | null = null;
	for (const o of sequence) state = merge(state, o).state;
	return state;
}

describe("merge", () => {
	it("reaches the same state in any order", () => {
		fc.assert(
			fc.property(
				ops.chain((list) =>
					fc.tuple(
						fc.constant(list),
						fc.shuffledSubarray(list, { minLength: list.length }),
					),
				),
				([original, shuffled]) => {
					expect(apply(shuffled)).toEqual(apply(original));
				},
			),
			{ numRuns: 1000 },
		);
	});

	it("is unchanged by replaying operations", () => {
		fc.assert(
			fc.property(ops, (list) => {
				expect(apply([...list, ...list])).toEqual(apply(list));
			}),
			{ numRuns: 1000 },
		);
	});
});
