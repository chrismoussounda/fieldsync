/**
 * Builds the whole app for Vercel in its Build Output format: the web app
 * as static files and the API as one Node function under /api.
 * https://vercel.com/docs/build-output-api/v3
 */
import { execSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { build } from "esbuild";

const root = join(import.meta.dirname, "..");
const out = join(root, ".vercel", "output");
const fn = join(out, "functions", "api.func");
// Native code can't be bundled; it ships beside the function instead.
const NATIVE = ["@node-rs/argon2"];

rmSync(out, { recursive: true, force: true });

execSync("pnpm --filter @fieldsync/web build", { cwd: root, stdio: "inherit" });
cpSync(join(root, "apps", "web", "dist"), join(out, "static"), {
	recursive: true,
});

await build({
	entryPoints: [join(root, "apps", "api", "src", "vercel.ts")],
	outfile: join(fn, "index.cjs"),
	bundle: true,
	platform: "node",
	target: "node22",
	format: "cjs",
	external: [...NATIVE, "pg-native"],
	logLevel: "warning",
});

// Each native package and the build for this machine's platform; Vercel
// builds on the Linux its functions run on.
const fromApi = createRequire(join(root, "apps", "api", "package.json"));
for (const name of NATIVE) {
	const dir = dirname(fromApi.resolve(`${name}/package.json`));
	copyPackage(name, dir);
	const own = createRequire(join(dir, "package.json"));
	const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
	for (const platform of Object.keys(manifest.optionalDependencies ?? {})) {
		try {
			copyPackage(platform, dirname(own.resolve(`${platform}/package.json`)));
		} catch {
			// Not installed on this platform.
		}
	}
}

writeJson(join(fn, ".vc-config.json"), {
	runtime: "nodejs22.x",
	handler: "index.cjs",
	launcherType: "Nodejs",
	shouldAddHelpers: false,
	maxDuration: 60,
});

writeJson(join(out, "config.json"), {
	version: 3,
	routes: [
		// The API's own path travels in the query, whatever the rewrite does.
		{ src: "^/api(/.*)?$", dest: "/api?__path=$1" },
		{ handle: "filesystem" },
	],
	crons: [{ path: "/api/demo/reset", schedule: "0 3 * * *" }],
});

function copyPackage(name: string, from: string): void {
	cpSync(from, join(fn, "node_modules", name), {
		recursive: true,
		dereference: true,
	});
}

function writeJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);
}
