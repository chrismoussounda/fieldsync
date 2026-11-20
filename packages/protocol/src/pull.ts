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
