import { describe, expect, it } from "vitest";
import { OpSchema } from "./op.ts";

const op = {
	opId: "0193a5c2-f1e0-7000-8000-000000000001",
	deviceId: "0a1b2c3d-0000-4000-8000-000000000001",
	entityType: "work_order",
	entityId: "0193a5c2-f1e0-7000-8000-0000000000aa",
	kind: "upsert",
	patch: { status: "in_progress" },
	base: { status: "0000000000001-0000-ffffffff" },
	hlc: "0000000000002-0000-0a1b2c3d",
	clientVersion: "0.1.0",
};

describe("OpSchema", () => {
	it("accepts a well-formed operation", () => {
		expect(OpSchema.parse(op)).toEqual(op);
	});

	it("rejects an unknown kind", () => {
		expect(OpSchema.safeParse({ ...op, kind: "rename" }).success).toBe(false);
	});

	it("rejects a malformed clock", () => {
		expect(OpSchema.safeParse({ ...op, hlc: "yesterday" }).success).toBe(false);
	});

	it("rejects a clock stamped by another device", () => {
		const forged = { ...op, hlc: "0000000000002-0000-ffffffff" };
		expect(OpSchema.safeParse(forged).success).toBe(false);
	});
});
