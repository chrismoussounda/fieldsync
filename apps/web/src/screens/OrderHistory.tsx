import { decode } from "@fieldsync/hlc";
import type { Op } from "@fieldsync/protocol";
import { WORK_ORDER } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff, OctagonX } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Section } from "@/components/section";
import { cn } from "@/lib/utils";
import { sitesOf } from "../app/sites.ts";
import { apiFetch, type Member } from "../app/workspace.ts";
import type { Session } from "../auth/session.ts";
import { describeValue, fieldLabel } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";

type Entry = {
	opId: string;
	kind: Op["kind"];
	changes: Op["patch"];
	at: number;
	receivedAt: string;
	by: string | null;
	device: string | null;
};

// Synced this long after it was made: worth saying it was done offline.
const LATE_MS = 5 * 60_000;

type Props = {
	db: LocalDb;
	session: Session;
	id: string;
	/** Changes when the record does, so the list is fetched again. */
	stamp: string;
};

/** Who changed the order and when: this device's unsynced edits, then the server's log. */
export function OrderHistory({ db, session, id, stamp }: Props) {
	const { t, i18n } = useTranslation();
	const [entries, setEntries] = useState<Entry[] | null>(null);
	const [offline, setOffline] = useState(false);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const sites = useLiveQuery(() => sitesOf(db), [db]);
	const names = new Map([
		...(members ?? []).map((m) => [m.id, m.name] as const),
		...(sites ?? []).map((s) => [s.id, s.name] as const),
	]);
	const local = useLiveQuery(
		() =>
			db.outbox
				.where("[entityType+entityId]")
				.equals([WORK_ORDER, id])
				.reverse()
				.toArray(),
		[db, id],
	);
	const waiting = local?.filter((r) => r.status !== "dead").length ?? 0;

	// biome-ignore lint/correctness/useExhaustiveDependencies: stamp and waiting only trigger a refetch, once this device's changes synced or others' arrived.
	useEffect(() => {
		let current = true;
		void apiFetch<{ entries: Entry[] }>(session, `/history/${WORK_ORDER}/${id}`)
			.then((result) => {
				if (!current) return;
				setEntries(result?.entries ?? []);
				setOffline(false);
			})
			.catch(() => current && setOffline(true));
		return () => {
			current = false;
		};
	}, [session, id, stamp, waiting]);

	const when = (at: number) =>
		new Intl.DateTimeFormat(i18n.language, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(at));

	const changes = (kind: Op["kind"], patch: Op["patch"]) => {
		if (kind === "delete") return <p>{t("order.history.deleted")}</p>;
		if (kind === "restore") return <p>{t("order.history.restored")}</p>;
		const fields = Object.entries(patch);
		if (fields.length === 0) {
			return (
				<p className="text-muted-foreground">{t("order.history.replaced")}</p>
			);
		}
		return (
			<dl className="grid gap-1">
				{fields.map(([field, value]) => (
					<div key={field} className="flex flex-wrap gap-x-2">
						<dt className="text-muted-foreground">{fieldLabel(field)}</dt>
						<dd className="font-medium break-words">
							{describeValue(field, value, names)}
						</dd>
					</div>
				))}
			</dl>
		);
	};

	return (
		<Section title={t("order.history.title")}>
			<ol className="grid">
				{local?.map((r) => (
					<Step
						key={r.opId}
						who={t("order.history.you")}
						when={when(decode(r.op.hlc).wall)}
						tone={r.status === "dead" ? "refused" : "waiting"}
						tag={
							r.status === "dead" ? (
								<Tag tone="refused" icon={<OctagonX />}>
									{t("order.history.refused")}
								</Tag>
							) : (
								<Tag tone="waiting" icon={<CloudOff />}>
									{t("order.history.waiting")}
								</Tag>
							)
						}
					>
						{changes(r.op.kind, r.op.patch)}
					</Step>
				))}
				{entries?.map((e) => (
					<Step
						key={e.opId}
						who={e.by ?? t("order.history.unknown")}
						when={when(e.at)}
						detail={[
							e.device,
							Date.parse(e.receivedAt) - e.at > LATE_MS &&
								t("order.history.late", {
									when: when(Date.parse(e.receivedAt)),
								}),
						]
							.filter(Boolean)
							.join(" · ")}
					>
						{changes(e.kind, e.changes)}
					</Step>
				))}
			</ol>
			{offline && (
				<p className="text-muted-foreground">{t("order.history.offline")}</p>
			)}
			{!offline && entries?.length === 0 && local?.length === 0 && (
				<p className="text-muted-foreground">{t("order.history.empty")}</p>
			)}
		</Section>
	);
}

function Step({
	who,
	when,
	detail,
	tone,
	tag,
	children,
}: {
	who: string;
	when: string;
	detail?: string;
	tone?: "waiting" | "refused";
	tag?: ReactNode;
	children: ReactNode;
}) {
	return (
		<li className="relative grid gap-1.5 border-l-2 border-border pb-5 pl-5 last:border-transparent last:pb-0">
			<span
				aria-hidden
				className={cn(
					"absolute top-1 -left-[0.4375rem] size-3 rounded-full border-2 border-card bg-primary",
					tone === "waiting" && "bg-warning",
					tone === "refused" && "bg-destructive",
				)}
			/>
			<p className="flex flex-wrap items-center gap-x-2 gap-y-1">
				<strong>{who}</strong>
				<span className="text-sm text-muted-foreground">{when}</span>
				{tag}
			</p>
			{detail && <p className="text-sm text-muted-foreground">{detail}</p>}
			{children}
		</li>
	);
}

function Tag({
	tone,
	icon,
	children,
}: {
	tone: "waiting" | "refused";
	icon: ReactNode;
	children: ReactNode;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium [&_svg]:size-3.5",
				tone === "waiting"
					? "bg-warning/15 text-warning"
					: "bg-destructive/10 text-destructive",
			)}
		>
			<span aria-hidden>{icon}</span>
			{children}
		</span>
	);
}
