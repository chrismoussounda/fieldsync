import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ROUTES } from "../app/route.ts";
import type { SyncLoop } from "../sync/loop.ts";

const DOT = {
	idle: "bg-status-done",
	syncing: "bg-status-active animate-pulse",
	offline: "bg-warning",
	error: "bg-destructive",
};

export function SyncBadge({
	loop,
	pending,
}: {
	loop: SyncLoop;
	pending: number;
}) {
	const { t } = useTranslation();
	const { state, lastSyncedAt } = useSyncExternalStore(
		loop.subscribe,
		loop.status,
	);
	const since = lastSyncedAt
		? t("sync.last", { time: new Date(lastSyncedAt).toLocaleTimeString() })
		: t("sync.never");
	return (
		<a
			href={ROUTES.debug}
			title={since}
			className="badge flex w-fit items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground"
		>
			<span
				aria-hidden
				className={cn(
					"size-2 rounded-full transition-colors duration-300",
					DOT[state],
				)}
			/>
			{t(`sync.${state}`)}
			{pending > 0 && (
				<span className="-ml-1 text-muted-foreground">
					{" · "}
					{t("sync.waiting", { count: pending })}
				</span>
			)}
		</a>
	);
}
