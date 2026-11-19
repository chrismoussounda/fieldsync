import type { Op } from "./op.ts";

type Value = Op["patch"][string];

export type Conflict = {
	opId: string;
	field: string;
	reason: "concurrent_edit" | "edit_on_deleted";
	winner: { value: Value | null; hlc: string };
	loser: { value: Value | null; hlc: string };
};

export type RejectReason = "INVALID_OP" | "FORBIDDEN" | "CLOCK_DRIFT";

export type OpResult =
	| { opId: string; status: "applied"; seq: number; conflicts: Conflict[] }
	| { opId: string; status: "duplicate"; seq: number; conflicts: Conflict[] }
	| { opId: string | null; status: "rejected"; reason: RejectReason };

export type PushRequest = { ops: unknown[] };

export type PushResponse = { results: OpResult[]; serverTime: number };
