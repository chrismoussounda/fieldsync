import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const { app } = await createApp(config);
await app.listen({ host: config.HOST, port: config.PORT });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => void app.close());
}
