import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { z } from "zod";
import { migrateToLatest } from "./db/migrate.ts";
import type { Database } from "./db/schema.ts";
import { seedDemo } from "./demo.ts";

const env = z
	.object({ DATABASE_URL: z.url(), DEMO_PASSWORD: z.string().min(8) })
	.parse(process.env);

const db = new Kysely<Database>({
	dialect: new PostgresDialect({
		pool: new pg.Pool({ connectionString: env.DATABASE_URL }),
	}),
});
await migrateToLatest(db as Kysely<unknown>);
await seedDemo(db, env.DEMO_PASSWORD);
await db.destroy();
