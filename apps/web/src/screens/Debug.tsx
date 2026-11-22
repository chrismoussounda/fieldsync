import { decode } from "@fieldsync/hlc";
import { WORK_ORDER } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { RefreshCw, Trash2, WifiOff } from "lucide-react";
import { type ReactNode, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import type { Sync } from "../app/workspace.ts";
import type { LocalDb } from "../sync/storage.ts";

const TONE = {
	pending: "bg-warning/15 text-warning",
	inflight: "bg-status-active/12 text-status-active",
	dead: "bg-destructive/10 text-destructive",
};

/** What the sync engine is doing on this device, for demos and support. */
export function Debug({ db, sync }: { db: LocalDb; sync: Sync }) {
	const { t, i18n } = useTranslation();
	const { client, loop, network, storage } = sync;
	const status = useSyncExternalStore(loop.subscribe, loop.status);
	const offline = useSyncExternalStore(network.subscribe, network.isOffline);
	const outbox = useLiveQuery(() => db.outbox.toArray(), [db]) ?? [];
	const cursor = useLiveQuery(() => db.getMeta<number>("cursor"), [db]) ?? 0;
	const deviceId = useLiveQuery(() => db.getMeta<string>("deviceId"), [db]);
	const titles = useLiveQuery(
		async () =>
			new Map(
				(await db.entities.toArray())
					.filter((r) => r.type === WORK_ORDER)
					.map((r) => [r.id, String(r.state.fields.title ?? "?")]),
			),
		[db],
	);
	const time = (ms: number) =>
		new Intl.DateTimeFormat(i18n.language, {
			dateStyle: "medium",
			timeStyle: "medium",
		}).format(new Date(ms));

	// Read on each render; the status subscription re-renders after every sync.
	const clock = decode(client.clockState());
	const offset = client.clockOffset();
	const seconds = Math.round(Math.abs(offset) / 1000);
	const dead = outbox.filter((r) => r.status === "dead");
	const facts: [string, ReactNode][] = [
		[t("debug.device"), <code key="d">{deviceId}</code>],
		[
			t("debug.clock"),
			<span key="c">
				{t("debug.clockValue", {
					when: time(clock.wall),
					counter: clock.counter,
				})}{" "}
				<code>{clock.node}</code>
			</span>,
		],
		[
			t("debug.serverTime"),
			Math.abs(offset) < 1000
				? t("debug.matches")
				: offset > 0
					? t("debug.ahead", { seconds })
					: t("debug.behind", { seconds }),
		],
		[t("debug.cursor"), t("debug.cursorValue", { cursor })],
	];

	return (
		<div className="grid grid-cols-1 gap-8">
			<PageHeader
				title={t("debug.title")}
				description={t("debug.description")}
			/>
			<Section title={t("debug.network")}>
				<div className="flex flex-wrap items-center gap-3">
					<Button onPress={() => void loop.run()}>
						<RefreshCw aria-hidden />
						{t("debug.syncNow")}
					</Button>
					<Toggle
						variant="outline"
						isSelected={offline}
						onChange={(next) => {
							network.setOffline(next);
							void loop.run();
						}}
						className="data-selected:border-warning/50 data-selected:bg-warning/15 data-selected:text-warning"
					>
						<WifiOff aria-hidden />
						{t("debug.simulate")}
					</Toggle>
					<span className="text-muted-foreground">
						{t(`sync.${status.state}`)}
						{status.lastSyncedAt &&
							` · ${t("debug.lastSynced", { when: time(status.lastSyncedAt) })}`}
					</span>
				</div>
				<p className="text-muted-foreground">{t("debug.simulateHint")}</p>
				<dl className="grid gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-[auto_1fr]">
					{facts.map(([label, value]) => (
						<div key={label} className="contents">
							<dt className="text-muted-foreground">{label}</dt>
							<dd className="break-all">{value}</dd>
						</div>
					))}
				</dl>
			</Section>
			<Section
				title={t("debug.outbox")}
				aside={outbox.length}
				action={
					dead.length > 0 && (
						<Button
							variant="destructive"
							onPress={() => void storage.discardDead(dead.map((r) => r.opId))}
						>
							<Trash2 aria-hidden />
							{t("debug.clear", { count: dead.length })}
						</Button>
					)
				}
			>
				{outbox.length === 0 ? (
					<p className="text-muted-foreground">{t("debug.empty")}</p>
				) : (
					<ul className="outbox grid divide-y">
						{outbox.map((r) => (
							<li key={r.opId} className="grid gap-1 py-3">
								<div className="flex flex-wrap items-center gap-2">
									<span
										className={cn(
											"rounded-full px-2.5 py-0.5 text-sm font-medium",
											TONE[r.status],
										)}
									>
										{t(`debug.${r.status}`)}
									</span>
									<span>
										{r.op.kind}{" "}
										<strong>{titles?.get(r.entityId) ?? "?"}</strong>
										{r.op.kind === "upsert" &&
											`: ${Object.keys(r.op.patch).join(", ")}`}
									</span>
									<span className="text-sm text-muted-foreground">
										{time(decode(r.op.hlc).wall)}
									</span>
								</div>
								{r.reason && (
									<code className="text-sm text-destructive">{r.reason}</code>
								)}
							</li>
						))}
					</ul>
				)}
			</Section>
		</div>
	);
}
