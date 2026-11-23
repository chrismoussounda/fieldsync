import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { ApiError } from "../errors.ts";
import type { Principal } from "./session.ts";

export type DeviceView = {
	id: string;
	name: string;
	user: { id: string; name: string };
	registeredAt: string;
	lastSeenAt: string | null;
	revokedAt: string | null;
};

export function requireAdmin(principal: Principal): void {
	if (principal.role !== "admin") throw new ApiError(403, "FORBIDDEN");
}

export async function listDevices(
	db: Kysely<Database>,
	principal: Principal,
): Promise<DeviceView[]> {
	requireAdmin(principal);
	const rows = await db
		.selectFrom("devices")
		.innerJoin("users", "users.id", "devices.user_id")
		.select([
			"devices.id",
			"devices.name",
			"devices.registered_at",
			"devices.last_seen_at",
			"devices.revoked_at",
			"users.id as user_id",
			"users.name as user_name",
		])
		.where("devices.org_id", "=", principal.orgId)
		.orderBy("devices.registered_at")
		.execute();
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		user: { id: r.user_id, name: r.user_name },
		registeredAt: r.registered_at.toISOString(),
		lastSeenAt: r.last_seen_at?.toISOString() ?? null,
		revokedAt: r.revoked_at?.toISOString() ?? null,
	}));
}

/** Locks a lost or stolen device out; its queued changes stay on it. */
export async function revokeDevice(
	db: Kysely<Database>,
	principal: Principal,
	deviceId: string,
	now: number,
): Promise<void> {
	requireAdmin(principal);
	// Its refresh tokens stay, useless: one that comes back is how a device that
	// was reloaded learns it was locked out.
	const device = await db
		.updateTable("devices")
		.set((eb) => ({
			revoked_at: eb.fn.coalesce("revoked_at", eb.val(new Date(now))),
		}))
		.where("id", "=", deviceId)
		.where("org_id", "=", principal.orgId)
		.returning("id")
		.executeTakeFirst();
	if (!device) throw new ApiError(404, "NOT_FOUND");
}
