import "fake-indexeddb/auto";
import { HttpError, SyncClient } from "@fieldsync/sync-client";
import { FakeServer } from "@fieldsync/sync-client/testing";
import { PHOTO } from "@fieldsync/work-orders";
import { describe, expect, it } from "vitest";
import type { User } from "../auth/session.ts";
import { DexieStorage, type FileRow, LocalDb } from "../sync/storage.ts";
import {
	addPhoto,
	type FileTransport,
	PhotoTransfer,
	photosOf,
} from "./photos.ts";

const ORDER = "00000000-0000-4000-8000-0000000000aa";
const user: User = {
	id: "00000000-0000-4000-8000-0000000000b1",
	name: "Junior",
	role: "technician",
};
const image = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

function setup() {
	const db = new LocalDb(crypto.randomUUID());
	const server = new FakeServer();
	server.time = Date.now();
	const client = new SyncClient({
		deviceId: "0a1b2c3d-0000-4000-8000-000000000001",
		clientVersion: "test",
		storage: new DexieStorage(db),
		transport: server,
	});
	const uploads: string[] = [];
	const stored = new Map<string, FileRow>();
	const files: FileTransport = {
		upload: async (id, file) => {
			if (server.offline) throw new TypeError("offline");
			uploads.push(id);
			stored.set(id, file);
		},
		download: async (id) => {
			if (server.offline) throw new TypeError("offline");
			return stored.get(id) ?? null;
		},
	};
	const transfer = new PhotoTransfer(db, files);
	const add = () =>
		addPhoto(db, client, { orderId: ORDER, user, image, caption: "Valve" });
	return { db, server, client, uploads, stored, transfer, add };
}

describe("addPhoto", () => {
	it("keeps the image and queues the photo's record", async () => {
		const { db, add } = setup();
		const id = await add();
		expect(await photosOf(db, ORDER)).toEqual([
			expect.objectContaining({ id, caption: "Valve", takenBy: user.id }),
		]);
		expect(await db.files.get(id)).toMatchObject({
			uploaded: 0,
			type: "image/jpeg",
		});
		const [queued] = await db.outbox.toArray();
		expect(queued?.op.patch).toMatchObject({
			contentType: "image/jpeg",
			size: 3,
		});
	});
});

describe("PhotoTransfer", () => {
	it("sends an image only once its record is accepted, and only once", async () => {
		const { db, server, client, uploads, transfer, add } = setup();
		server.offline = true;
		const id = await add();
		await transfer.run();
		expect(uploads).toEqual([]);

		server.offline = false;
		await client.syncOnce();
		await transfer.run();
		await transfer.run();
		expect(uploads).toEqual([id]);
		expect((await db.files.get(id))?.uploaded).toBe(1);
	});

	it("keeps the image while the network is down, and sends it later", async () => {
		const { db, server, client, uploads, transfer, add } = setup();
		const id = await add();
		await client.syncOnce();
		server.offline = true;
		await transfer.run();
		expect((await db.files.get(id))?.uploaded).toBe(0);

		server.offline = false;
		await transfer.run();
		expect(uploads).toEqual([id]);
	});

	it("says so, and stops trying, when the demo has no room for an image", async () => {
		const { db, client, stored, add } = setup();
		let tries = 0;
		const transfer = new PhotoTransfer(db, {
			upload: async () => {
				tries += 1;
				throw new HttpError(413, "DEMO_LIMIT");
			},
			download: async (id) => stored.get(id) ?? null,
		});
		const id = await add();
		await client.syncOnce();
		await transfer.run();
		await transfer.run();
		expect(tries).toBe(1);
		expect(await db.files.get(id)).toMatchObject({
			uploaded: 0,
			refused: true,
		});
	});

	it("drops the image of a photo the server refused", async () => {
		const { db, server, client, uploads, transfer, add } = setup();
		const id = await add();
		const [queued] = await db.outbox.toArray();
		server.reject.add(queued?.opId ?? "");
		await client.syncOnce();
		await transfer.run();
		expect(uploads).toEqual([]);
		expect(await db.files.get(id)).toBeUndefined();
	});

	it("fetches the images of photos it holds, and forgets those gone", async () => {
		const { db, stored, transfer } = setup();
		const id = crypto.randomUUID();
		stored.set(id, {
			id,
			type: "image/jpeg",
			bytes: new ArrayBuffer(3),
			uploaded: 1,
		});
		const state = {
			fields: { orderId: ORDER, takenBy: user.id, takenAt: "2026-11-21" },
			clocks: {},
			createdHlc: "0000000000001-0000-0a1b2c3d",
			deletedHlc: null,
			restoredHlc: null,
		};
		await db.entities.put({ type: PHOTO, id, state });
		await transfer.run();
		expect(await db.files.get(id)).toBeDefined();

		await db.entities.delete([PHOTO, id]);
		await transfer.run();
		expect(await db.files.get(id)).toBeUndefined();
	});

	it("waits for an image its author has not sent yet", async () => {
		const { db, transfer } = setup();
		const id = crypto.randomUUID();
		await db.entities.put({
			type: PHOTO,
			id,
			state: {
				fields: { orderId: ORDER },
				clocks: {},
				createdHlc: "0000000000001-0000-0a1b2c3d",
				deletedHlc: null,
				restoredHlc: null,
			},
		});
		await transfer.run();
		expect(await db.files.get(id)).toBeUndefined();
	});
});
