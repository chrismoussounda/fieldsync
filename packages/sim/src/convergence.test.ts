import { FakeServer } from "@fieldsync/sync-client/testing";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { scenario } from "./arbitraries.ts";
import { runScenario } from "./run.ts";
import { type SimServer, World } from "./world.ts";

function fakeServer(): SimServer {
	const server = new FakeServer();
	return {
		push: (_device, request) => server.push(request),
		pull: (_device, request) => server.pull(request),
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

	it("reports a device that diverged", async () => {
		const server = fakeServer();
		const broken: SimServer = {
			...server,
			// The second device never receives anything.
			pull: async (device, request, now) => {
				const page = await server.pull(device, request, now);
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
