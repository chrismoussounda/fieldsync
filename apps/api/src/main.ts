import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { loadConfig } from "./config.ts";
import { migrateToLatest } from "./db/migrate.ts";
import type { Database } from "./db/schema.ts";
import { buildServer, DEFAULT_LIMITS } from "./http/server.ts";

const config = loadConfig();

const db = new Kysely<Database>({
	dialect: new PostgresDialect({
		pool: new pg.Pool({ connectionString: config.DATABASE_URL }),
	}),
});
// One instance, so migrating on start is safe.
await migrateToLatest(db as Kysely<unknown>);

const app = buildServer({
	db,
	secret: new TextEncoder().encode(config.JWT_SECRET),
	logger: { level: config.LOG_LEVEL },
	trustProxy: config.TRUST_PROXY,
	limits: { ...DEFAULT_LIMITS, login: config.LOGIN_LIMIT },
});
await app.listen({ host: config.HOST, port: config.PORT });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, async () => {
		await app.close();
		await db.destroy();
	});
}
