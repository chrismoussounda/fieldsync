import type { FastifyInstance } from "fastify";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Config } from "./config.ts";
import { migrateToLatest } from "./db/migrate.ts";
import type { Database } from "./db/schema.ts";
import { seedDemo } from "./demo.ts";
import { buildServer, DEFAULT_LIMITS } from "./http/server.ts";

/**
 * Connects, brings the database up to date and builds the server. Copies
 * starting together are safe: migrations take a lock, the demo seeds once.
 */
export async function createApp(
	config: Config,
): Promise<{ app: FastifyInstance; db: Kysely<Database> }> {
	const db = new Kysely<Database>({
		dialect: new PostgresDialect({
			pool: new pg.Pool({
				connectionString: config.DATABASE_URL,
				max: config.DB_POOL_MAX,
			}),
		}),
	});
	await migrateToLatest(db as Kysely<unknown>);
	if (config.DEMO_PASSWORD) await seedDemo(db, config.DEMO_PASSWORD);

	const app = buildServer({
		db,
		secret: new TextEncoder().encode(config.JWT_SECRET),
		logger: { level: config.LOG_LEVEL },
		trustProxy: config.TRUST_PROXY,
		limits: { ...DEFAULT_LIMITS, login: config.LOGIN_LIMIT },
		cronSecret: config.CRON_SECRET,
		demo: config.DEMO_PASSWORD !== undefined,
	});
	app.addHook("onClose", () => db.destroy());
	return { app, db };
}
