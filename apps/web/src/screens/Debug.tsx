import { decode } from "@fieldsync/hlc";
import type { Op } from "@fieldsync/protocol";
import {
	CHECKLIST_ITEM,
	PART,
	PHOTO,
	SITE,
	TIME_ENTRY,
	WORK_ORDER,
} from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import i18n from "i18next";
import { ChevronDown, RefreshCw, Trash2, WifiOff } from "lucide-react";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import type { fr } from "@/i18n/fr";
import { cn } from "@/lib/utils";
import type { Sync } from "../app/workspace.ts";
import { fieldLabel } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";

const TONE = {
	pending: "bg-warning/15 text-warning",
	inflight: "bg-status-active/12 text-status-active",
	dead: "bg-destructive/10 text-destructive",
};

type Fields = Record<string, unknown>;
type Change = keyof typeof fr.debug.change;

/** What the sync engine is doing on this device, for demos and support. */
export function Debug({ db, sync }: { db: LocalDb; sync: Sync }) {
	const { t, i18n } = useTranslation();
	const { client, loop, network, storage } = sync;
	const status = useSyncExternalStore(loop.subscribe, loop.status);
	const offline = useSyncExternalStore(network.subscribe, network.isOffline);
	const outbox = useLiveQuery(() => db.outbox.toArray(), [db]) ?? [];
	const cursor = useLiveQuery(() => db.getMeta<number>("cursor"), [db]) ?? 0;
	const deviceId = useLiveQuery(() => db.getMeta<string>("deviceId"), [db]);
	const records = useLiveQuery(
		async () =>
			new Map<string, Fields>(
				(await db.entities.toArray()).map((r) => [r.id, r.state.fields]),
			),
		[db],
	);
	const [technical, setTechnical] = useState(false);
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
		[
			t("debug.lastSynced"),
			status.lastSyncedAt ? time(status.lastSyncedAt) : t("sync.never"),
		],
		[
			t("debug.clock"),
			Math.abs(offset) < 1000
				? t("debug.onTime")
				: offset > 0
					? t("debug.slow", { seconds })
					: t("debug.fast", { seconds }),
		],
	];
	// For support: the raw values the engine works with.
	const details: [string, ReactNode][] = [
		[t("debug.device"), <code key="d">{deviceId}</code>],
		[
			t("debug.hlc"),
			<code key="c">
				{clock.wall} · {clock.counter} · {clock.node}
			</code>,
		],
		[t("debug.cursor"), <code key="k">{cursor}</code>],
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
					</span>
				</div>
				<p className="text-muted-foreground">{t("debug.simulateHint")}</p>
				<Facts facts={facts} className="border-t pt-4" />
				<Button
					variant="ghost"
					aria-expanded={technical}
					className="w-fit px-2 text-muted-foreground"
					onPress={() => setTechnical((v) => !v)}
				>
					<ChevronDown
						aria-hidden
						className={cn(
							"transition-transform duration-200",
							technical && "rotate-180",
						)}
					/>
					{t("debug.technical")}
				</Button>
				{technical && (
					<Facts
						facts={details}
						className="animate-in text-sm duration-200 fade-in-0 slide-in-from-top-1"
					/>
				)}
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
				<p className="text-muted-foreground">{t("debug.outboxHint")}</p>
				{outbox.length === 0 ? (
					<p className="text-muted-foreground">{t("debug.empty")}</p>
				) : (
					<ul className="outbox grid divide-y">
						{outbox.map((r) => (
							<li
								key={r.opId}
								className="grid animate-in gap-1 py-3 duration-300 fade-in-0"
							>
								<div className="flex flex-wrap items-center gap-2">
									<span
										className={cn(
											"rounded-full px-2.5 py-0.5 text-sm font-medium",
											TONE[r.status],
										)}
									>
										{t(`debug.${r.status}`)}
									</span>
									<span>{changeText(r.op, records)}</span>
									<span className="text-sm text-muted-foreground">
										{time(decode(r.op.hlc).wall)}
									</span>
								</div>
								{r.reason && (
									<p className="text-sm text-destructive">
										{t(`debug.reasons.${reasonOf(r.reason)}`)}
									</p>
								)}
							</li>
						))}
					</ul>
				)}
			</Section>
		</div>
	);
}

function Facts({
	facts,
	className,
}: {
	facts: [string, ReactNode][];
	className?: string;
}) {
	return (
		<dl
			className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]", className)}
		>
			{facts.map(([label, value]) => (
				<div key={label} className="contents">
					<dt className="text-muted-foreground">{label}</dt>
					<dd className="break-all">{value}</dd>
				</div>
			))}
		</dl>
	);
}

const REASONS = ["FORBIDDEN", "INVALID_OP", "CLOCK_DRIFT"] as const;
const reasonOf = (reason: string) =>
	REASONS.find((r) => r === reason) ?? "other";

const named = (text: unknown) =>
	typeof text === "string" && text ? text : i18n.t("debug.change.untitled");

/** One waiting change as a sentence: what was done, and to which job or site. */
function changeText(
	op: Op,
	records: ReadonlyMap<string, Fields> | undefined,
): string {
	const own: Fields = { ...records?.get(op.entityId), ...op.patch };
	const changed = (field: string) => field in op.patch;
	const orderId = op.entityType === WORK_ORDER ? op.entityId : own.orderId;
	const order = named(records?.get(String(orderId))?.title ?? own.title);
	const say = (key: Change, values: Record<string, string> = {}) =>
		i18n.t(`debug.change.${key}`, { order, ...values });

	switch (op.entityType) {
		case WORK_ORDER:
			if (op.kind === "delete") return say("orderDeleted");
			if (op.kind === "restore") return say("orderRestored");
			if (changed("title") && changed("status")) return say("orderCreated");
			return say("orderEdited", {
				fields: Object.keys(op.patch)
					.map((f) => fieldLabel(f).toLowerCase())
					.join(", "),
			});
		case CHECKLIST_ITEM:
			if (op.kind === "delete") return say("stepDeleted");
			if (changed("done")) {
				return say(own.done ? "stepTicked" : "stepUnticked", {
					step: named(own.label),
				});
			}
			return say("stepSaved", { step: named(own.label) });
		case PART:
			return say(op.kind === "delete" ? "partDeleted" : "partSaved", {
				part: named(own.name),
			});
		case TIME_ENTRY:
			if (op.kind === "delete") return say("timeDeleted");
			return say(
				changed("endedAt") && own.endedAt ? "timeStopped" : "timeStarted",
			);
		case PHOTO:
			if (op.kind === "delete") {
				return say(own.signer ? "signatureDeleted" : "photoDeleted");
			}
			if (own.signer) return say("signed", { name: String(own.signer) });
			return say(changed("orderId") ? "photoAdded" : "captionSaved");
		case SITE: {
			const site = named(own.name);
			if (op.kind === "delete") return say("siteDeleted", { site });
			if (op.kind === "restore") return say("siteRestored", { site });
			return say("siteSaved", { site });
		}
		default:
			return say("other");
	}
}
