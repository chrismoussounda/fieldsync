import { encode } from "@fieldsync/hlc";
import type { Op } from "@fieldsync/protocol";

export const PHONE = "0a1b2c3d-0000-4000-8000-000000000001";
export const OFFICE = "ffffffff-0000-4000-8000-000000000002";

export function stamp(deviceId: string, wall: number, counter = 0): string {
	return encode({ wall, counter, node: deviceId.slice(0, 8) });
}

let nextOp = 0;

export function op(
	deviceId: string,
	wall: number,
	overrides: Partial<Op> = {},
): Op {
	nextOp += 1;
	return {
		opId: `00000000-0000-7000-8000-${nextOp.toString(16).padStart(12, "0")}`,
		deviceId,
		entityType: "work_order",
		entityId: "0193a5c2-f1e0-7000-8000-0000000000aa",
		kind: "upsert",
		patch: {},
		base: {},
		hlc: stamp(deviceId, wall),
		clientVersion: "0.1.0",
		...overrides,
	};
}
