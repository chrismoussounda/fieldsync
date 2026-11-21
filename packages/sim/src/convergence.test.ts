import { FakeServer } from "@fieldsync/sync-client/testing";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { scenario } from "./arbitraries.ts";
import { simAuthorize, simScope } from "./roles.ts";
import { runScenario } from "./run.ts";
import { type SimServer, World } from "./world.ts";

function fakeServer(): SimServer {
	const server = new FakeServer();
	server.scopeOf = simScope;
	server.authorize = simAuthorize;
	return {
		push: (_device, request, now, audience) => {
			server.time = now;
			return server.push(request, audience);
		},
		pull: (_device, request, now, audience) => {
			server.time = now;
			return server.pull(request, audience);
		},
		entity: (_device, request, now, audience) => {
			server.time = now;
			return server.entity(request, audience);
		},
		entities: async () => server.entities,
	};
}

describe("simulation", () => {
	it("converges whatever the network does", async () => {
		await fc.assert(
			fc.asyncProperty(scenario(), (s) => runScenario(fakeServer(), s)),
			{ numRuns: 500 },
		);
	}, 60_000);

	it("delivers a held-back request after the device already retried it", async () => {
		const server = fakeServer();
		const world = new World(server, { skews: [0, 0] });
		await world.apply({
			kind: "edit",
			device: 0,
			entity: 0,
			patch: { status: 1 },
		});
		await world.apply({ kind: "sync", device: 0, fault: "delay" });
		await world.apply({ kind: "sync", device: 0, fault: "none" });
		await world.apply({ kind: "deliver", index: 0 });
		await world.heal();

		expect(world.devices[1]?.storage.entities).toEqual(await server.entities());
		expect(world.deadOps()).toEqual([]);
	});

	it("takes an order from a technician who edited it offline", async () => {
		const server = fakeServer();
		const world = new World(server, { skews: [0, 0], techs: [false, true] });
		const [office, tech] = world.devices;
		await world.apply({
			kind: "edit",
			device: 0,
			entity: 0,
			patch: { assignee: 1, status: 1 },
		});
		await world.apply({ kind: "sync", device: 0, fault: "none" });
		await world.apply({ kind: "sync", device: 1, fault: "none" });
		expect(tech?.storage.entities.size).toBe(1);

		await world.apply({ kind: "network", device: 1, online: false });
		await world.apply({
			kind: "edit",
			device: 1,
			entity: 0,
			patch: { status: 2 },
		});
		await world.apply({
			kind: "edit",
			device: 0,
			entity: 0,
			patch: { assignee: 2 },
		});
		await world.heal();

		// His edit was refused, and the order is gone from his phone.
		expect(tech?.storage.entities.size).toBe(0);
		expect(world.deadOps().map((d) => d.device)).toEqual([tech]);
		expect(office?.storage.entities).toEqual(await server.entities());
	});

	it("reports a device that diverged", async () => {
		const server = fakeServer();
		const broken: SimServer = {
			...server,
			// The second device never receives anything.
			pull: async (device, request, now, audience) => {
				const page = await server.pull(device, request, now, audience);
				return device.startsWith("00000002") ? { ...page, changes: [] } : page;
			},
		};
		await expect(
			runScenario(broken, {
				skews: [0, 0],
				actions: [{ kind: "edit", device: 0, entity: 0, patch: { status: 1 } }],
			}),
		).rejects.toThrow("diverged");
	});
});
