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
	changes: Change[];
	nextCursor: number;
	hasMore: boolean;
	serverTime: number;
};
