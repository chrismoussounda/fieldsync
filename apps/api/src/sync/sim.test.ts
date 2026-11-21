import type { EntityState } from "@fieldsync/protocol";
import {
	runScenario,
	type SimServer,
	scenario,
	simAuthorize,
	simParent,
	simScope,
} from "@fieldsync/sim";
import fc from "fast-check";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, it } from "vitest";
import type { Database } from "../db/schema.ts";
import { createTestDb, emptyTestDb } from "../db/testing.ts";
import { handleGetEntity } from "./entity.ts";
import { handlePull } from "./pull.ts";
import { handlePush } from "./push.ts";
import { toState } from "./records.ts";
import type { Scoping } from "./scope.ts";

const ORG = "00000000-0000-4000-8000-000000000001";

let db: Kysely<Database>;

beforeAll(async () => {
	db = await createTestDb();
});

afterAll(() => db.destroy());

const scoping: Scoping = {
	scopeOf: (_type, state) => simScope(state),
	parentOf: (type, id) => simParent(type, id),
};

const server: SimServer = {
	push: (deviceId, request, now, audience) =>
		handlePush(db, { orgId: ORG, deviceId }, request, {
			authorize: (op, current, parent) =>
				simAuthorize(op, current, parent, audience),
			scoping,
			now: () => now,
		}),
	pull: (deviceId, request, now, audience) =>
		handlePull(db, { orgId: ORG, deviceId }, request, {
			now: () => now,
			audience,
		}),
	entity: (deviceId, request, now, audience) =>
		handleGetEntity(db, { orgId: ORG, deviceId }, request, {
			now: () => now,
			audience,
			scoping,
		}),
	async entities() {
		const rows = await db.selectFrom("entities").selectAll().execute();
		return new Map<string, EntityState>(
			rows.map((row) => [`${row.type}:${row.id}`, toState(row)]),
		);
	},
};

it("converges against the real push and pull handlers", async () => {
	await fc.assert(
		fc.asyncProperty(scenario({ maxActions: 100 }), async (s) => {
			await emptyTestDb(db);
			await db.insertInto("orgs").values({ id: ORG, name: "Sim" }).execute();
			await runScenario(server, s);
		}),
		{ numRuns: 50 },
	);
}, 120_000);
