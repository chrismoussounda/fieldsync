import { encode } from "@fieldsync/hlc";
import type { Op } from "@fieldsync/protocol";
import {
	PostgreSqlContainer,
	type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrateToLatest } from "../db/migrate.ts";
import type { Database } from "../db/schema.ts";
import { handlePull } from "./pull.ts";
import { handlePush } from "./push.ts";
import { openRules } from "./testing.ts";

const ORG = "00000000-0000-4000-8000-000000000001";
const DEVICES = 20;
const OPS_PER_PUSH = 5;

let container: StartedPostgreSqlContainer;
let db: Kysely<Database>;

beforeAll(async () => {
	container = await new PostgreSqlContainer("postgres:16-alpine").start();
	const pool = new pg.Pool({
		connectionString: container.getConnectionUri(),
		max: DEVICES + 2,
	});
	// An idle connection can still be closing when the container stops; the
	// pool reports that as an error, which would fail a run that passed.
	pool.on("error", () => {});
	db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
	await migrateToLatest(db as Kysely<unknown>);
	await db.insertInto("orgs").values({ id: ORG, name: "Demo" }).execute();
}, 120_000);

afterAll(async () => {
	await db?.destroy();
	await container?.stop();
});

function deviceId(n: number): string {
	return `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
}

function ops(device: string): Op[] {
	return Array.from({ length: OPS_PER_PUSH }, (_, i) => ({
		opId: crypto.randomUUID(),
		deviceId: device,
		entityType: "work_order",
		entityId: crypto.randomUUID(),
		kind: "upsert",
		patch: { title: `Job ${i}` },
		base: {},
		hlc: encode({ wall: Date.now(), counter: i, node: device.slice(0, 8) }),
		clientVersion: "0.1.0",
	}));
}

it("never lets a pulling device skip a change under concurrent pushes", async () => {
	const seen: number[] = [];
	let cursor = 0;
	let pushing = true;

	async function pullAll(): Promise<void> {
		for (;;) {
			const page = await handlePull(
				db,
				{ orgId: ORG, deviceId: deviceId(0) },
				{
					cursor,
					limit: 7,
				},
			);
			seen.push(...page.changes.map((c) => c.seq));
			cursor = page.nextCursor;
			if (!page.hasMore) return;
		}
	}

	const puller = (async () => {
		while (pushing) await pullAll();
		await pullAll();
	})();

	await Promise.all(
		Array.from({ length: DEVICES }, (_, n) => {
			const device = deviceId(n + 1);
			return handlePush(
				db,
				{ orgId: ORG, deviceId: device },
				{ ops: ops(device) },
				{ ...openRules },
			);
		}),
	);
	pushing = false;
	await puller;

	const total = DEVICES * OPS_PER_PUSH;
	expect(seen).toEqual(Array.from({ length: total }, (_, i) => i + 1));
}, 60_000);
