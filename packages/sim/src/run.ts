import type { Scenario } from "./arbitraries.ts";
import { type SimServer, World } from "./world.ts";

/** Plays a scenario, heals the network, and checks every device matches the server. */
export async function runScenario(
	server: SimServer,
	{ skews, actions }: Scenario,
): Promise<void> {
	const world = new World(server, { skews });
	for (const action of actions) await world.apply(action);
	await world.heal();

	const expected = await server.entities();
	for (const device of world.devices) {
		if (!sameState(device.storage.entities, expected)) {
			throw new Error(`Device ${device.id} diverged from the server`);
		}
	}
	const dead = world.deadOps();
	if (dead.length > 0) {
		throw new Error(`${dead.length} operations were rejected`);
	}
}

function sameState(a: Map<string, unknown>, b: Map<string, unknown>): boolean {
	if (a.size !== b.size) return false;
	for (const [key, value] of a) {
		if (!b.has(key) || !deepEqual(value, b.get(key))) return false;
	}
	return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
	const keysA = Object.keys(a);
	const keysB = Object.keys(b);
	if (keysA.length !== keysB.length) return false;
	return keysA.every((k) =>
		deepEqual(
			(a as Record<string, unknown>)[k],
			(b as Record<string, unknown>)[k],
		),
	);
}
