import { HttpError, HttpTransport, SyncClient } from "@fieldsync/sync-client";
import type { Role, Session, User } from "../auth/session.ts";
import { SyncLoop } from "../sync/loop.ts";
import { DexieStorage, type LocalDb } from "../sync/storage.ts";
import { NetworkSwitch } from "../sync/switch.ts";
import { API_URL } from "./open.ts";
import { type FileTransport, PhotoTransfer } from "./photos.ts";

const CLIENT_VERSION = "0.1.0";

export type Member = {
	id: string;
	name: string;
	role: Role;
	active: boolean;
	/** Sent to admins only. */
	email?: string;
};

export type Sync = {
	client: SyncClient;
	loop: SyncLoop;
	network: NetworkSwitch;
	storage: DexieStorage;
	photos: PhotoTransfer;
};

/** Starts syncing as the signed-in user; returns the parts and how to stop it. */
export async function startSync(
	db: LocalDb,
	session: Session,
): Promise<{ sync: Sync; stop: () => void }> {
	const storage = new DexieStorage(db);
	const network = new NetworkSwitch(
		new HttpTransport({
			baseUrl: API_URL,
			getToken: () => session.getToken(),
			onError: (error) => session.reportFailure(error),
		}),
	);
	const client = new SyncClient({
		deviceId: await session.deviceId(),
		clientVersion: CLIENT_VERSION,
		storage,
		transport: network,
		savedClock: await db.getMeta<string>("clock"),
	});
	const loop = new SyncLoop({
		client,
		saveClock: (clock) => db.setMeta("clock", clock),
	});
	const photos = new PhotoTransfer(db, fileTransport(session, network));
	const stopLoop = loop.start();
	// Once per session, after the first sync that reaches the server.
	let members: Promise<boolean> | null = null;
	const afterSync = loop.subscribe(() => {
		if (loop.status().state !== "idle") return;
		void photos.run();
		if (members) return;
		members = refreshMembers(db, session).then((done) => {
			if (!done) members = null;
			return done;
		});
	});
	return {
		sync: { client, loop, network, storage, photos },
		stop: () => {
			stopLoop();
			afterSync();
		},
	};
}

function fileTransport(
	session: Session,
	network: NetworkSwitch,
): FileTransport {
	const online = () => {
		// Same error as a real failed fetch, when the debug switch cuts the network.
		if (network.isOffline()) throw new TypeError("Failed to fetch");
	};
	return {
		upload: async (id, file) => {
			online();
			await apiRequest(session, `/photos/${id}`, {
				method: "PUT",
				body: new Blob([file.bytes], { type: file.type }),
				type: file.type,
			});
		},
		download: async (id) => {
			online();
			try {
				const response = await apiRequest(session, `/photos/${id}`);
				return {
					id,
					type: response.headers.get("content-type") ?? "image/jpeg",
					bytes: await response.arrayBuffer(),
					uploaded: 1,
				};
			} catch (error) {
				if (error instanceof HttpError && error.code === "PHOTO_PENDING") {
					return null;
				}
				throw error;
			}
		},
	};
}

/** A signed-in request to the API; throws `HttpError`, or `TypeError` offline. */
export async function apiRequest(
	session: Session,
	path: string,
	{
		method = "GET",
		body,
		type,
	}: { method?: string; body?: BodyInit; type?: string } = {},
): Promise<Response> {
	const token = await session.getToken();
	const headers: Record<string, string> = { authorization: `Bearer ${token}` };
	if (type) headers["content-type"] = type;
	const response = await fetch(`${API_URL}${path}`, {
		method,
		headers,
		...(body === undefined ? {} : { body }),
	});
	if (!response.ok) {
		const payload = await response.json().catch(() => null);
		const error = new HttpError(response.status, payload?.error);
		await session.reportFailure(error);
		throw error;
	}
	return response;
}

/** `apiRequest` with JSON both ways. */
export async function apiFetch<T>(
	session: Session,
	path: string,
	{ method = "GET", json }: { method?: string; json?: unknown } = {},
): Promise<T | null> {
	const response = await apiRequest(session, path, {
		method,
		...(json === undefined
			? {}
			: { body: JSON.stringify(json), type: "application/json" }),
	});
	return response.status === 204 ? null : ((await response.json()) as T);
}

// Cached, so names still show offline.
async function refreshMembers(db: LocalDb, session: Session): Promise<boolean> {
	const result = await apiFetch<{ users: Member[] }>(session, "/users").catch(
		() => null,
	);
	if (!result) return false;
	await db.setMeta("members", result.users);
	return true;
}

export type { User };
