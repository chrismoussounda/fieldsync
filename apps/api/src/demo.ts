import { encode } from "@fieldsync/hlc";
import type { Op } from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import { WORK_ORDER_SCOPING } from "./auth/policy.ts";
import { createUser } from "./auth/users.ts";
import type { Database, Role } from "./db/schema.ts";
import { handlePush } from "./sync/push.ts";
import { resetOrg } from "./sync/reset.ts";

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

type Site = {
	name: string;
	address: string;
	contactName: string;
	contactPhone: string;
	accessNotes?: string;
	location: { lat: number; lng: number };
};

const SITES: Record<string, Site> = {
	bakery: {
		name: "Boulangerie La Paix",
		address: "Avenue de la Paix, Poto-Poto, Brazzaville",
		contactName: "Mme Okemba",
		contactPhone: "+242 06 000 0001",
		accessNotes: "Enter through the back yard; the pump is under the stairs.",
		location: { lat: -4.2668, lng: 15.2829 },
	},
	clinic: {
		name: "Clinique de Bacongo",
		address: "Rue Mbochi, Bacongo, Brazzaville",
		contactName: "Dr Malonga",
		contactPhone: "+242 06 000 0002",
		location: { lat: -4.2853, lng: 15.2643 },
	},
	coldStore: {
		name: "Port Cold Store",
		address: "Boulevard Charles de Gaulle, Pointe-Noire",
		contactName: "M. Tchicaya",
		contactPhone: "+242 05 000 0003",
		accessNotes: "Sign in at the port gate with the order number.",
		location: { lat: -4.7835, lng: 11.8462 },
	},
};

type Order = {
	title: string;
	/** A key of SITES; without one, the address is the order's own. */
	site?: keyof typeof SITES;
	address: string;
	/** Only for orders without a site; the others use the site's. */
	location?: { lat: number; lng: number };
	priority: "low" | "normal" | "urgent";
	assignee: string | null;
	status: string;
	/** Days from the seed date; past means late, unless done. */
	due: number;
};

const ORDERS: Order[] = [
	{
		title: "Replace the water pump",
		site: "bakery",
		address: "Avenue de la Paix, Poto-Poto, Brazzaville",
		priority: "urgent",
		assignee: "junior@fieldsync.demo",
		status: "assigned",
		due: 0,
	},
	{
		title: "Inspect the generator",
		site: "clinic",
		address: "Rue Mbochi, Bacongo, Brazzaville",
		priority: "normal",
		assignee: "junior@fieldsync.demo",
		status: "in_progress",
		due: -2,
	},
	{
		title: "Fix the cold room door",
		site: "coldStore",
		address: "Boulevard Charles de Gaulle, Pointe-Noire",
		priority: "normal",
		assignee: "merveille@fieldsync.demo",
		status: "assigned",
		due: 2,
	},
	{
		title: "Service the air conditioning",
		site: "coldStore",
		address: "Boulevard Charles de Gaulle, Pointe-Noire",
		priority: "low",
		assignee: "merveille@fieldsync.demo",
		status: "done",
		due: -5,
	},
	{
		title: "Check the solar panels",
		address: "Route de Kintélé, Brazzaville",
		location: { lat: -4.1612, lng: 15.3458 },
		priority: "normal",
		assignee: null,
		status: "open",
		due: 3,
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
	for (const user of USERS) {
		await createUser(db, { ...user, orgId: DEMO_ORG, password });
	}
	await seedOrders(db, now);
}

/**
 * Puts the demo orders back as they started. Users and devices stay, so
 * signed-in visitors see their app start over at its next sync.
 */
export async function resetDemo(
	db: Kysely<Database>,
	now = Date.now(),
): Promise<void> {
	await resetOrg(db, DEMO_ORG);
	await seedOrders(db, now);
}

async function seedOrders(db: Kysely<Database>, now: number): Promise<void> {
	const users = await db
		.selectFrom("users")
		.select(["id", "email"])
		.where("org_id", "=", DEMO_ORG)
		.execute();
	const ids = new Map(users.map((u) => [u.email, u.id]));

	const siteIds = new Map(
		Object.keys(SITES).map((key) => [key, crypto.randomUUID()]),
	);
	const write = (
		entityType: string,
		entityId: string,
		patch: Op["patch"],
		counter: number,
	): Op => ({
		opId: crypto.randomUUID(),
		deviceId: SEED_DEVICE,
		entityType,
		entityId,
		kind: "upsert",
		patch,
		base: {},
		hlc: encode({ wall: now, counter, node: SEED_DEVICE.slice(0, 8) }),
		clientVersion: "seed",
	});
	const sites = Object.entries(SITES).map(([key, site], i) =>
		write("site", siteIds.get(key) ?? "", site, i),
	);
	const orders = ORDERS.map((order, i) =>
		write(
			"work_order",
			crypto.randomUUID(),
			{
				title: order.title,
				siteId: order.site ? (siteIds.get(order.site) ?? null) : null,
				address: order.address,
				...(order.location && { location: order.location }),
				priority: order.priority,
				status: order.status,
				assigneeId: order.assignee ? (ids.get(order.assignee) ?? null) : null,
				dueDate: new Date(now + order.due * 86_400_000)
					.toISOString()
					.slice(0, 10),
			},
			sites.length + i,
		),
	);
	await handlePush(
		db,
		{ orgId: DEMO_ORG, deviceId: SEED_DEVICE },
		{ ops: [...sites, ...orders] },
		// Filed under each order's assignee, so it reaches that technician's phone.
		{ authorize: () => true, scoping: WORK_ORDER_SCOPING, now: () => now },
	);
}
