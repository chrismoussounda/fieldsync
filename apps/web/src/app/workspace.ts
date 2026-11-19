import { HttpTransport, SyncClient } from "@fieldsync/sync-client";
import { type Role, Session, type User } from "../auth/session.ts";
import { SyncLoop } from "../sync/loop.ts";
import { DexieStorage, LocalDb } from "../sync/storage.ts";
import { NetworkSwitch } from "../sync/switch.ts";

export const API_URL = import.meta.env.VITE_API_URL ?? "/api";
const CLIENT_VERSION = "0.1.0";

export type Member = { id: string; name: string; role: Role };

/** What the app needs before anyone signs in. */
export async function openWorkspace(): Promise<{
	db: LocalDb;
	session: Session;
}> {
	const db = new LocalDb();
	const session = new Session({ db, baseUrl: API_URL });
	await session.load();
	return { db, session };
}

export type Sync = {
	client: SyncClient;
	loop: SyncLoop;
	network: NetworkSwitch;
	storage: DexieStorage;
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
	const stopLoop = loop.start();
	// Once per session, after the first sync that reaches the server.
	let members: Promise<boolean> | null = null;
	const stopMembers = loop.subscribe(() => {
		if (loop.status().state !== "idle" || members) return;
		members = refreshMembers(db, session).then((done) => {
			if (!done) members = null;
			return done;
		});
	});
	return {
		sync: { client, loop, network, storage },
		stop: () => {
			stopLoop();
			stopMembers();
		},
	};
}

// Cached, so names still show offline.
async function refreshMembers(db: LocalDb, session: Session): Promise<boolean> {
	const token = await session.getToken().catch(() => null);
	if (!token) return false;
	const response = await fetch(`${API_URL}/users`, {
		headers: { authorization: `Bearer ${token}` },
	}).catch(() => null);
	if (!response?.ok) return false;
	const { users } = (await response.json()) as { users: Member[] };
	await db.setMeta("members", users);
	return true;
}

export type { User };
