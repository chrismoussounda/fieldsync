import { isDeleted } from "@fieldsync/merge";
import type { EntityState } from "@fieldsync/protocol";
import { HttpError } from "@fieldsync/sync-client";
import { MAX_PHOTO_BYTES, PHOTO } from "@fieldsync/work-orders";
import type { User } from "../auth/session.ts";
import type { SyncLoop } from "../sync/loop.ts";
import type { FileRow, LocalDb } from "../sync/storage.ts";

/** Longest side of a stored photo, in pixels. */
const MAX_SIDE = 1600;
// Images fetched per round, so a long list does not hold up the next sync.
const DOWNLOADS_PER_RUN = 20;

export type Photo = {
	id: string;
	orderId: string;
	caption: string | null;
	takenBy: string;
	takenAt: string;
};

/** The photos this device holds, oldest first; deleted ones left out. */
export async function photosOf(
	db: LocalDb,
	orderId?: string,
): Promise<Photo[]> {
	const rows = await db.ofType(PHOTO);
	return rows
		.filter((r) => !isDeleted(r.state))
		.map((r) => toPhoto(r.id, r.state))
		.filter((p) => !orderId || p.orderId === orderId)
		.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

function toPhoto(id: string, state: EntityState): Photo {
	const f = state.fields;
	const text = (v: unknown) => (typeof v === "string" ? v : "");
	return {
		id,
		orderId: text(f.orderId),
		caption: text(f.caption) || null,
		takenBy: text(f.takenBy),
		takenAt: text(f.takenAt),
	};
}

/** Shrinks a picture to at most 1600 px on its longest side, as JPEG. */
export async function shrink(file: Blob): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
	const canvas = new OffscreenCanvas(
		Math.round(bitmap.width * scale),
		Math.round(bitmap.height * scale),
	);
	canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	return canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
}

/**
 * Keeps the image on this device and queues the photo's record like any edit.
 * The image goes to the server once the record is accepted.
 */
export async function addPhoto(
	db: LocalDb,
	loop: Pick<SyncLoop, "mutate">,
	{
		orderId,
		user,
		image,
		caption,
	}: {
		orderId: string;
		user: User;
		image: Blob;
		caption: string | null;
	},
): Promise<string> {
	if (image.size > MAX_PHOTO_BYTES) throw new Error("PHOTO_TOO_LARGE");
	const id = crypto.randomUUID();
	await db.files.put({
		id,
		type: image.type,
		bytes: await image.arrayBuffer(),
		uploaded: 0,
	});
	await loop.mutate({
		entityType: PHOTO,
		entityId: id,
		patch: {
			orderId,
			contentType: image.type,
			size: image.size,
			takenBy: user.id,
			takenAt: new Date().toISOString(),
			...(caption ? { caption } : {}),
		},
	});
	return id;
}

export type FileTransport = {
	upload(id: string, file: FileRow): Promise<void>;
	/** Null while the author's device has not sent it. */
	download(id: string): Promise<FileRow | null>;
};

/**
 * Moves images between this device and the server, after each sync: sends
 * this device's once their records are accepted, fetches the others it holds
 * records of, so they show offline too, and forgets images of photos gone.
 */
export class PhotoTransfer {
	readonly #db: LocalDb;
	readonly #transport: FileTransport;
	#running: Promise<void> | null = null;

	constructor(db: LocalDb, transport: FileTransport) {
		this.#db = db;
		this.#transport = transport;
	}

	/** One run at a time; a call during a run waits for it. */
	run(): Promise<void> {
		this.#running ??= this.#once().finally(() => {
			this.#running = null;
		});
		return this.#running;
	}

	async #once(): Promise<void> {
		const photos = new Set((await photosOf(this.#db)).map((p) => p.id));
		await this.#upload(photos);
		await this.#download(photos);
		// An image whose photo left the device or was deleted, once safe on the server.
		await this.#db.files
			.where("uploaded")
			.equals(1)
			.and((f) => !photos.has(f.id))
			.delete();
	}

	async #upload(photos: Set<string>): Promise<void> {
		const waiting = await this.#db.files.where("uploaded").equals(0).toArray();
		for (const file of waiting) {
			const queued = await this.#db.outbox
				.where("[entityType+entityId]")
				.equals([PHOTO, file.id])
				.toArray();
			const live = queued.some((r) => r.status !== "dead");
			// Refused or deleted before it was sent: nothing will ever want it.
			if (!photos.has(file.id) && !live) {
				await this.#db.files.delete(file.id);
				continue;
			}
			// The server must hold the record first.
			if (queued.length > 0) continue;
			try {
				await this.#transport.upload(file.id, file);
				await this.#db.files.update(file.id, { uploaded: 1 });
			} catch (error) {
				if (!(error instanceof HttpError)) return; // offline: try next time
			}
		}
	}

	async #download(photos: Set<string>): Promise<void> {
		const have = new Set(await this.#db.files.toCollection().primaryKeys());
		const missing = [...photos].filter((id) => !have.has(id));
		for (const id of missing.slice(0, DOWNLOADS_PER_RUN)) {
			try {
				const file = await this.#transport.download(id);
				if (file) await this.#db.files.put(file);
			} catch (error) {
				if (!(error instanceof HttpError)) return;
			}
		}
	}
}
