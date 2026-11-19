import { FakeServer } from "@fieldsync/sync-client/testing";
import { expect, it } from "vitest";
import { NetworkSwitch } from "./switch.ts";

it("fails like a lost network while off, and passes through when on", async () => {
	const server = new FakeServer();
	const network = new NetworkSwitch(server);
	network.setOffline(true);
	await expect(network.pull({ cursor: 0, limit: 10 })).rejects.toThrow(
		TypeError,
	);
	expect(server.pushes).toEqual([]);
	network.setOffline(false);
	await expect(network.pull({ cursor: 0, limit: 10 })).resolves.toMatchObject({
		changes: [],
	});
});
