import { type Kysely, sql } from "kysely";
import type { Database } from "../db/schema.ts";

type Callback = (
	error: Error | null,
	result?: { current: number; ttl: number },
) => void;

/**
 * A rate-limit store in Postgres. Counts kept in memory would start from zero
 * in every copy of the server, and hosting may start a new one at any time.
 */
export function postgresStore(db: Kysely<Database>) {
	return class PostgresStore {
		readonly prefix: string;

		constructor(_options?: unknown, prefix = "") {
			this.prefix = prefix;
		}

		incr(key: string, callback: Callback, timeWindow: number): void {
			sql<{ hits: number; ttl: number }>`
				insert into rate_limits (key, hits, reset_at)
				values (${this.prefix + key}, 1, now() + ${timeWindow} * interval '1 millisecond')
				on conflict (key) do update set
					hits = case when rate_limits.reset_at <= now() then 1 else rate_limits.hits + 1 end,
					reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
				returning hits, (extract(epoch from reset_at - now()) * 1000)::int as ttl`
				.execute(db)
				.then(({ rows: [row] }) =>
					callback(null, {
						current: row?.hits ?? 1,
						ttl: row?.ttl ?? timeWindow,
					}),
				)
				.catch((error: Error) => callback(error));
		}

		child(route: { method?: string | string[]; url?: string }): PostgresStore {
			return new PostgresStore(undefined, `${route.method}${route.url}:`);
		}
	};
}

/** Forgets windows that are over; run now and then to keep the table small. */
export async function pruneRateLimits(db: Kysely<Database>): Promise<void> {
	await db
		.deleteFrom("rate_limits")
		.where("reset_at", "<", new Date())
		.execute();
}
