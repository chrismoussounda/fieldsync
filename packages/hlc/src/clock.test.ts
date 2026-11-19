import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Clock, MAX_DRIFT_MS } from "./clock.ts";
import { decode, encode } from "./timestamp.ts";

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

	it("borrows the next millisecond when the counter is full", () => {
		const full = encode({ wall: 1_000, counter: 0xffff, node: NODE });
		const clock = new Clock(NODE, fakeTime(1_000).now, full);
		const stamp = clock.tick();
		expect(decode(stamp)).toMatchObject({ wall: 1_001, counter: 0 });
		expect(stamp > full).toBe(true);
	});

	it("rejects a node that is not 8 hex characters", () => {
		expect(() => new Clock("phone-1", fakeTime().now)).toThrow("Invalid node");
	});
});

describe("receive", () => {
	const OTHER = "ffffffff";

	it("jumps to a remote clock that is ahead", () => {
		const clock = new Clock(NODE, fakeTime(1_000).now);
		clock.receive(encode({ wall: 2_000, counter: 4, node: OTHER }));
		expect(decode(clock.state())).toEqual({
			wall: 2_000,
			counter: 5,
			node: NODE,
		});
	});

	it("only bumps the counter when the local clock is ahead", () => {
		const time = fakeTime(3_000);
		const clock = new Clock(NODE, time.now);
		clock.tick();
		time.set(1_000);
		clock.receive(encode({ wall: 2_000, counter: 9, node: OTHER }));
		expect(decode(clock.state())).toMatchObject({ wall: 3_000, counter: 1 });
	});

	it("goes past both counters when the times are equal", () => {
		const clock = new Clock(NODE, fakeTime(1_000).now);
		clock.tick();
		clock.receive(encode({ wall: 1_000, counter: 7, node: OTHER }));
		expect(decode(clock.state())).toMatchObject({ wall: 1_000, counter: 8 });
	});

	it("ignores a remote clock more than a day ahead", () => {
		const clock = new Clock(NODE, fakeTime(1_000).now);
		const before = clock.state();
		clock.receive(
			encode({ wall: 1_000 + MAX_DRIFT_MS + 1, counter: 0, node: OTHER }),
		);
		expect(clock.state()).toBe(before);
	});

	it("accepts a remote clock exactly a day ahead", () => {
		const clock = new Clock(NODE, fakeTime(1_000).now);
		clock.receive(
			encode({ wall: 1_000 + MAX_DRIFT_MS, counter: 0, node: OTHER }),
		);
		expect(decode(clock.state()).wall).toBe(1_000 + MAX_DRIFT_MS);
	});

	it("makes the next local stamp sort after everything seen", () => {
		const remote = fc.record({
			wall: fc.integer({ min: 0, max: 10_000 }),
			counter: fc.integer({ min: 0, max: 100 }),
			node: fc.constant(OTHER),
		});
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 10_000 }), remote, (now, seen) => {
				const clock = new Clock(NODE, fakeTime(now).now);
				const before = clock.tick();
				clock.receive(encode(seen));
				const after = clock.tick();
				expect(after > before).toBe(true);
				expect(after > encode(seen)).toBe(true);
			}),
		);
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
