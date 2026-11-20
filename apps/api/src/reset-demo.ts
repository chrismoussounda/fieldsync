import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { z } from "zod";
import type { Database } from "./db/schema.ts";
import { resetDemo } from "./demo.ts";

const env = z.object({ DATABASE_URL: z.url() }).parse(process.env);

const db = new Kysely<Database>({
	dialect: new PostgresDialect({
		pool: new pg.Pool({ connectionString: env.DATABASE_URL }),
	}),
});
await resetDemo(db);
await db.destroy();
