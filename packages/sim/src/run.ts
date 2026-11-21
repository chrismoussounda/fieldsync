import type { EntityState } from "@fieldsync/protocol";
import type { Scenario } from "./arbitraries.ts";
import { simParent, simScope } from "./roles.ts";
import { type Audience, type SimServer, World } from "./world.ts";

/**
 * Plays a scenario, heals the network, and checks every device holds exactly
 * the server's records it may see: all of them for the office, a technician's
 * own for each technician.
 */
export async function runScenario(
	server: SimServer,
	{ skews, techs, actions }: Scenario,
): Promise<void> {
	const world = new World(server, { skews, ...(techs ? { techs } : {}) });
	for (const action of actions) await world.apply(action);
	await world.heal();

	const all = await server.entities();
	for (const device of world.devices) {
		if (!sameState(device.storage.entities, visible(all, device.audience))) {
			throw new Error(`Device ${device.id} diverged from the server`);
		}
	}
	// Technicians may be refused, for records not theirs; the office never.
	const refused = world.deadOps().filter((d) => d.device.audience === null);
	if (refused.length > 0) {
		throw new Error(`${refused.length} office operations were rejected`);
	}
}

function visible(
	all: Map<string, EntityState>,
	audience: Audience,
): Map<string, EntityState> {
	if (audience === null) return all;
	// A photo is visible with its order.
	const scope = (key: string, state: EntityState): string | null => {
		const [type = "", id = ""] = key.split(":");
		const parent = simParent(type, id);
		if (!parent) return simScope(state);
		const order = all.get(`${parent.type}:${parent.id}`);
		return order ? simScope(order) : null;
	};
	return new Map(
		[...all].filter(([key, state]) => scope(key, state) === audience),
	);
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
