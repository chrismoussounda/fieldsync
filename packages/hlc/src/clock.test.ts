import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Clock } from "./clock.ts";
import { decode } from "./timestamp.ts";

const NODE = "0a1b2c3d";

function fakeTime(start = 1_000) {
	let time = start;
	return {
		now: () => time,
		set: (value: number) => {
			time = value;
		},
	};
}

describe("tick", () => {
	it("stamps the current time and the node", () => {
		const clock = new Clock(NODE, fakeTime(1_000).now);
		expect(decode(clock.tick())).toEqual({
			wall: 1_000,
			counter: 0,
			node: NODE,
		});
	});

	it("counts events within the same millisecond", () => {
		const clock = new Clock(NODE, fakeTime().now);
		clock.tick();
		expect(decode(clock.tick()).counter).toBe(1);
	});

	it("resets the counter when time moves forward", () => {
		const time = fakeTime(1_000);
		const clock = new Clock(NODE, time.now);
		clock.tick();
		clock.tick();
		time.set(1_001);
		expect(decode(clock.tick())).toMatchObject({ wall: 1_001, counter: 0 });
	});

	it("keeps increasing whatever the device clock does", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 10_000 }), { minLength: 2 }),
				(times) => {
					const time = fakeTime();
					const clock = new Clock(NODE, time.now);
					let previous = "";
					for (const t of times) {
						time.set(t);
						const stamp = clock.tick();
						expect(stamp > previous).toBe(true);
						previous = stamp;
					}
				},
			),
		);
	});

	it("rejects a node that is not 8 hex characters", () => {
		expect(() => new Clock("phone-1", fakeTime().now)).toThrow("Invalid node");
	});
});

describe("state", () => {
	it("lets a restarted clock continue after its last stamp", () => {
		const first = new Clock(NODE, fakeTime(5_000).now);
		const last = first.tick();
		const restarted = new Clock(NODE, fakeTime(1_000).now, first.state());
		expect(restarted.tick() > last).toBe(true);
	});
});
