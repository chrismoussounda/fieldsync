import type { EntityState } from "@fieldsync/merge";
import type { Conflict, Op, OpResult } from "@fieldsync/protocol";
import type { ColumnType, Generated, JSONColumnType } from "kysely";

// node-postgres returns bigint as a string, PGlite as a number: read with Number().
type Seq = ColumnType<string | number, number, number>;
type CreatedAt = ColumnType<Date, never, never>;

export type Database = {
	orgs: {
		id: string;
		name: string;
		seq: Generated<Seq>;
		epoch: Generated<string>;
		demo_key_hash: string | null;
		/** Set on a visitor's own copy of the demo. */
		demo_expires_at: Date | null;
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
		parent_type: string | null;
		parent_id: string | null;
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
		scope_before: string | null;
		scope_after: string | null;
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
	rate_limits: {
		key: string;
		hits: number;
		reset_at: Date;
	};
	photo_files: {
		org_id: string;
		id: string;
		content_type: string;
		bytes: Uint8Array;
		uploaded_at: CreatedAt;
	};
	users: {
		id: string;
		org_id: string;
		email: string;
		name: string;
		password_hash: string;
		role: Role;
		created_at: CreatedAt;
		disabled_at: Date | null;
	};
	devices: {
		id: string;
		org_id: string;
		user_id: string;
		name: string;
		registered_at: CreatedAt;
		last_seen_at: Date | null;
		revoked_at: Date | null;
	};
	refresh_tokens: {
		hash: string;
		family_id: string;
		user_id: string;
		device_id: string;
		expires_at: Date;
		used_at: Date | null;
	};
};

export type Role = "technician" | "dispatcher" | "admin";
