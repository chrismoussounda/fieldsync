import { createContext, useContext } from "react";
import type { Session, User } from "../auth/session.ts";
import type { LocalDb } from "../sync/storage.ts";
import type { Sync } from "./workspace.ts";

/** What every signed-in screen works with. */
export type AppState = {
	db: LocalDb;
	session: Session;
	user: User;
	sync: Sync;
	/** Changes not yet accepted by the server. */
	pending: number;
};

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
	const app = useContext(AppContext);
	if (!app) throw new Error("useApp outside the signed-in app");
	return app;
}
