import { z } from "zod";

const Env = z.object({
	DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
	JWT_SECRET: z.string().min(32),
	HOST: z.string().default("0.0.0.0"),
	PORT: z.coerce.number().int().min(1).max(65535).default(3000),
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
