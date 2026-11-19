import fc from "fast-check";
import type { Action } from "./world.ts";

const FIELDS = ["status", "priority", "assignee", "notes"];

export type Scenario = { skews: number[]; actions: Action[] };

export function scenario({
	maxDevices = 5,
	entities = 4,
	maxSkewMs = 60 * 60 * 1000,
	maxActions = 200,
} = {}): fc.Arbitrary<Scenario> {
	const device = fc.nat({ max: maxDevices - 1 });
	const entity = fc.nat({ max: entities - 1 });
	const action: fc.Arbitrary<Action> = fc.oneof(
		{
			weight: 6,
			arbitrary: fc.record({
				kind: fc.constant("edit" as const),
				device,
				entity,
				patch: fc.dictionary(fc.constantFrom(...FIELDS), fc.nat({ max: 9 }), {
					minKeys: 1,
				}),
			}),
		},
		{
			weight: 1,
			arbitrary: fc.record({
				kind: fc.constantFrom("delete" as const, "restore" as const),
				device,
				entity,
			}),
		},
		{
			weight: 4,
			arbitrary: fc.record({
				kind: fc.constant("sync" as const),
				device,
				fault: fc.constantFrom(
					"none" as const,
					"none" as const,
					"lose" as const,
					"delay" as const,
				),
			}),
		},
		{
			weight: 2,
			arbitrary: fc.record({
				kind: fc.constant("network" as const),
				device,
				online: fc.boolean(),
			}),
		},
		{
			weight: 2,
			arbitrary: fc.record({
				kind: fc.constant("wait" as const),
				ms: fc.nat({ max: 60_000 }),
			}),
		},
		{
			weight: 1,
			arbitrary: fc.record({
				kind: fc.constant("deliver" as const),
				index: fc.nat(),
			}),
		},
	);
	return fc.record({
		skews: fc.array(fc.integer({ min: -maxSkewMs, max: maxSkewMs }), {
			minLength: 2,
			maxLength: maxDevices,
		}),
		actions: fc.array(action, { minLength: 20, maxLength: maxActions }),
	});
}
