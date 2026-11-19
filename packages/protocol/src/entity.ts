import type { Op } from "./op.ts";

export type EntityState = {
	fields: Op["patch"];
	// Per field, the clock of the write that last won.
	clocks: Record<string, string>;
	createdHlc: string;
	deletedHlc: string | null;
	restoredHlc: string | null;
};

export type EntityRequest = { entityType: string; entityId: string };

export type EntityResponse = {
	entity: EntityState | null;
	serverTime: number;
};
