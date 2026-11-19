import { useSyncExternalStore } from "react";
import { ROUTES } from "../app/route.ts";
import type { SyncLoop } from "../sync/loop.ts";

const LABELS = {
	idle: "Synced",
	syncing: "Syncing…",
	offline: "Offline",
	error: "Sync failed",
};

export function SyncBadge({
	loop,
	pending,
}: {
	loop: SyncLoop;
	pending: number;
}) {
	const { state, lastSyncedAt } = useSyncExternalStore(
		loop.subscribe,
		loop.status,
	);
	const since = lastSyncedAt
		? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
		: "Not synced yet";
	return (
		<a href={ROUTES.debug} className={`badge sync-${state}`} title={since}>
			{LABELS[state]}
			{pending > 0 && ` · ${pending} waiting`}
		</a>
	);
}
