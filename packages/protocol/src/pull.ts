import type { EntityState } from "./entity.ts";
import type { Op } from "./op.ts";

export type Change = {
	seq: number;
	opId: string;
	deviceId: string;
	entityType: string;
	entityId: string;
	kind: Op["kind"];
	patch: Op["patch"];
	hlc: string;
	/**
	 * Set when this change moves the record into or out of what the device
	 * syncs, such as an order assigned to or taken from its technician.
	 */
	scope?: "enter" | "leave";
	/** With `enter`: the record as the server holds it, since earlier changes were not sent. */
	state?: EntityState;
};

export type PullRequest = { cursor: number; limit: number };

export type PullResponse = {
	/** Changes when the org's data is reset; the device must then pull from 0. */
	epoch: string;
	changes: Change[];
	nextCursor: number;
	hasMore: boolean;
	serverTime: number;
};
