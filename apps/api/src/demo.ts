import { encode } from "@fieldsync/hlc";
import type { Op } from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import { createUser } from "./auth/users.ts";
import type { Database, Role } from "./db/schema.ts";
import { handlePush } from "./sync/push.ts";

export const DEMO_ORG = "00000000-0000-4000-8000-00000000d001";
// Writes the demo orders like any device, so they reach phones through pull.
const SEED_DEVICE = "5eed0000-0000-4000-8000-000000000000";

const USERS: { email: string; name: string; role: Role }[] = [
	{ email: "admin@fieldsync.demo", name: "Ange Moukala", role: "admin" },
	{
		email: "dispatch@fieldsync.demo",
		name: "Grâce Mabiala",
		role: "dispatcher",
	},
	{
		email: "junior@fieldsync.demo",
		name: "Junior Nkounkou",
		role: "technician",
	},
	{
		email: "merveille@fieldsync.demo",
		name: "Merveille Bouanga",
		role: "technician",
	},
];

type Order = {
	title: string;
	address: string;
	priority: "low" | "normal" | "urgent";
	assignee: string | null;
	status: string;
};

const ORDERS: Order[] = [
	{
		title: "Replace the water pump",
		address: "Avenue de la Paix, Poto-Poto, Brazzaville",
		priority: "urgent",
		assignee: "junior@fieldsync.demo",
		status: "assigned",
	},
	{
		title: "Inspect the generator",
		address: "Rue Mbochi, Bacongo, Brazzaville",
		priority: "normal",
		assignee: "junior@fieldsync.demo",
		status: "in_progress",
	},
	{
		title: "Fix the cold room door",
		address: "Boulevard Charles de Gaulle, Pointe-Noire",
		priority: "normal",
		assignee: "merveille@fieldsync.demo",
		status: "assigned",
	},
	{
		title: "Service the air conditioning",
		address: "Avenue de l'Indépendance, Loandjili, Pointe-Noire",
		priority: "low",
		assignee: "merveille@fieldsync.demo",
		status: "done",
	},
	{
		title: "Check the solar panels",
		address: "Route de Kintélé, Brazzaville",
		priority: "normal",
		assignee: null,
		status: "open",
	},
];

/** Creates the demo org once; does nothing if it already exists. */
export async function seedDemo(
	db: Kysely<Database>,
	password: string,
	now = Date.now(),
): Promise<void> {
	const exists = await db
		.selectFrom("orgs")
		.select("id")
		.where("id", "=", DEMO_ORG)
		.executeTakeFirst();
	if (exists) return;

	await db.insertInto("orgs").values({ id: DEMO_ORG, name: "Demo" }).execute();
	const ids = new Map<string, string>();
	for (const user of USERS) {
		ids.set(
			user.email,
			await createUser(db, { ...user, orgId: DEMO_ORG, password }),
		);
	}

	const ops: Op[] = ORDERS.map((order, i) => ({
		opId: crypto.randomUUID(),
		deviceId: SEED_DEVICE,
		entityType: "work_order",
		entityId: crypto.randomUUID(),
		kind: "upsert",
		patch: {
			title: order.title,
			address: order.address,
			priority: order.priority,
			status: order.status,
			assigneeId: order.assignee ? (ids.get(order.assignee) ?? null) : null,
			dueDate: new Date(now + (i + 1) * 86_400_000).toISOString().slice(0, 10),
		},
		base: {},
		hlc: encode({ wall: now, counter: i, node: SEED_DEVICE.slice(0, 8) }),
		clientVersion: "seed",
	}));
	await handlePush(
		db,
		{ orgId: DEMO_ORG, deviceId: SEED_DEVICE },
		{ ops },
		{ authorize: () => true, now: () => now },
	);
}
