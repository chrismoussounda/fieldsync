import { Session } from "../auth/session.ts";
import { LocalDb } from "../sync/storage.ts";

export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

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
