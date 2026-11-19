import { useSyncExternalStore } from "react";
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
		<button
			type="button"
			className={`badge sync-${state}`}
			title={since}
			onClick={() => void loop.run()}
		>
			{LABELS[state]}
			{pending > 0 && ` · ${pending} waiting`}
		</button>
	);
}
