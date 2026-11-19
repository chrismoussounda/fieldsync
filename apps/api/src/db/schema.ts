import type { EntityState } from "@fieldsync/merge";
import type { Conflict, Op, OpResult } from "@fieldsync/protocol";
import type { ColumnType, Generated, JSONColumnType } from "kysely";

// Postgres returns bigint as a string.
type Seq = ColumnType<string, number | string, number | string>;
type CreatedAt = ColumnType<Date, never, never>;

export type Database = {
	orgs: {
		id: string;
		name: string;
		seq: Generated<Seq>;
		created_at: CreatedAt;
	};
	entities: {
		org_id: string;
		type: string;
		id: string;
		fields: JSONColumnType<EntityState["fields"]>;
		clocks: JSONColumnType<EntityState["clocks"]>;
		created_hlc: string;
		deleted_hlc: string | null;
		restored_hlc: string | null;
		updated_seq: Seq;
	};
	changes: {
		org_id: string;
		seq: Seq;
		op_id: string;
		device_id: string;
		entity_type: string;
		entity_id: string;
		kind: Op["kind"];
		patch: JSONColumnType<Op["patch"]>;
		hlc: string;
		created_at: CreatedAt;
	};
	received_ops: {
		org_id: string;
		op_id: string;
		device_id: string;
		result: JSONColumnType<OpResult>;
		received_at: CreatedAt;
	};
	conflicts: {
		id: string;
		org_id: string;
		op_id: string;
		entity_type: string;
		entity_id: string;
		field: string;
		reason: Conflict["reason"];
		winner: JSONColumnType<Conflict["winner"]>;
		loser: JSONColumnType<Conflict["loser"]>;
		detected_at: CreatedAt;
		reviewed_by: string | null;
		reviewed_at: Date | null;
	};
};
