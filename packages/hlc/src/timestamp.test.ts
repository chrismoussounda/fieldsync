import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decode, encode, type Timestamp } from "./timestamp.ts";

const timestamp = fc.record({
	wall: fc.integer({ min: 0, max: 2 ** 48 }),
	counter: fc.integer({ min: 0, max: 0xffff }),
	node: fc.stringMatching(/^[0-9a-f]{8}$/),
});

function compare(a: Timestamp, b: Timestamp): number {
	if (a.wall !== b.wall) return a.wall - b.wall;
	if (a.counter !== b.counter) return a.counter - b.counter;
	return a.node < b.node ? -1 : a.node > b.node ? 1 : 0;
}

describe("encode", () => {
	it("pads each part to a fixed width", () => {
		expect(encode({ wall: 255, counter: 1, node: "0a1b2c3d" })).toBe(
			"00000000000ff-0001-0a1b2c3d",
		);
	});

	it("round-trips through decode", () => {
		fc.assert(
			fc.property(timestamp, (t) => {
				expect(decode(encode(t))).toEqual(t);
			}),
		);
	});

	it("orders strings like the timestamps they encode", () => {
		fc.assert(
			fc.property(timestamp, timestamp, (a, b) => {
				const strings =
					encode(a) < encode(b) ? -1 : encode(a) > encode(b) ? 1 : 0;
				expect(strings).toBe(Math.sign(compare(a, b)));
			}),
		);
	});
});

describe("decode", () => {
	it("rejects a malformed string", () => {
		expect(() => decode("not-a-clock")).toThrow("Invalid HLC");
	});
});
