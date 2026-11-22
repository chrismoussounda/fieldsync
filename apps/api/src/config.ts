import { z } from "zod";

const Env = z.object({
	DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
	JWT_SECRET: z.string().min(32),
	HOST: z.string().default("0.0.0.0"),
	PORT: z.coerce.number().int().min(1).max(65535).default(3000),
	// Behind a hosting proxy, so rate limits see each client's own address.
	TRUST_PROXY: z
		.enum(["true", "false"])
		.default("false")
		.transform((v) => v === "true"),
	// Sign-ins per account and address per 15 minutes.
	LOGIN_LIMIT: z.coerce.number().int().min(1).default(10),
	// Open connections per copy of the server; small on hosted functions.
	DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
	// Seeds the demo org on start when set; nothing happens if it exists.
	DEMO_PASSWORD: z.string().min(8).optional(),
	// Lets a scheduled job reset the demo, sent as "Authorization: Bearer …".
	CRON_SECRET: z.string().min(16).optional(),
	LOG_LEVEL: z
		.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
		.default("info"),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const parsed = Env.safeParse(env);
	if (!parsed.success) {
		// Names only: the values may be secrets.
		const names = [...new Set(parsed.error.issues.map((i) => i.path[0]))];
		throw new Error(`Invalid environment: ${names.join(", ")}`);
	}
	return parsed.data;
}
