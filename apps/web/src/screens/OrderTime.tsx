import {
	canManage,
	formatMinutes,
	minutesBetween,
	TIME_ENTRY,
	WORK_ORDER,
} from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { Play, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Person } from "@/components/person";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/format";
import { usePhone } from "@/lib/use-phone";
import { entriesOf } from "../app/timesheet.ts";
import type { Member } from "../app/workspace.ts";
import type { User } from "../auth/session.ts";
import { localDate } from "../filters.ts";
import type { SyncLoop } from "../sync/loop.ts";
import type { LocalDb } from "../sync/storage.ts";

type Props = {
	db: LocalDb;
	loop: SyncLoop;
	user: User;
	orderId: string;
	order: Record<string, unknown>;
};

/** `1:05:09` since a start time. */
function elapsed(since: string, now: number): string {
	const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

/** The technician clocks in and out on site; works offline like any edit. */
export function OrderTime({ db, loop, user, orderId, order }: Props) {
	const { t, i18n } = useTranslation();
	const phone = usePhone();
	const entries = useLiveQuery(() => entriesOf(db, orderId), [db, orderId]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const [now, setNow] = useState(Date.now);
	const office = canManage(user.role);
	const assigned = order.assigneeId === user.id;
	const running = entries?.find(
		(e) => e.technicianId === user.id && e.endedAt === null,
	);

	useEffect(() => {
		if (!running) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [running]);

	if (!entries) return null;
	if (entries.length === 0 && !assigned) return null;
	const total = entries.reduce(
		(sum, e) => sum + minutesBetween(e.startedAt, e.endedAt, now),
		0,
	);

	async function start() {
		setNow(Date.now());
		await loop.mutate({
			entityType: TIME_ENTRY,
			entityId: crypto.randomUUID(),
			patch: {
				orderId,
				technicianId: user.id,
				startedAt: new Date().toISOString(),
				endedAt: null,
			},
		});
		if (order.status === "assigned") {
			await loop.mutate({
				entityType: WORK_ORDER,
				entityId: orderId,
				patch: { status: "in_progress" },
			});
		}
	}

	async function stop(id: string) {
		setNow(Date.now());
		await loop.mutate({
			entityType: TIME_ENTRY,
			entityId: id,
			patch: { endedAt: new Date().toISOString() },
		});
	}

	const clock = (iso: string) =>
		new Date(iso).toLocaleTimeString(i18n.language, {
			hour: "2-digit",
			minute: "2-digit",
		});
	const action = running ? (
		<Button
			variant="destructive"
			className="h-12 w-full text-base"
			onPress={() => void stop(running.id)}
		>
			<Square aria-hidden />
			{t("order.time.stop")}
		</Button>
	) : (
		<Button className="h-12 w-full text-base" onPress={() => void start()}>
			<Play aria-hidden />
			{t("order.time.start")}
		</Button>
	);

	return (
		<Section
			title={t("order.time.title")}
			aside={
				entries.length > 0 &&
				t("order.time.total", { total: formatMinutes(total) })
			}
		>
			{running && (
				<div className="grid gap-1 rounded-2xl bg-primary p-5 text-primary-foreground">
					<span className="flex items-center gap-2 text-sm font-medium opacity-90">
						<span className="size-2 animate-pulse rounded-full bg-current" />
						{t("order.time.since", { time: clock(running.startedAt) })}
					</span>
					<span className="font-mono text-4xl font-semibold tabular-nums">
						{elapsed(running.startedAt, now)}
					</span>
				</div>
			)}
			{assigned &&
				(phone ? (
					<div
						data-action-bar
						className="fixed inset-x-3 bottom-24 z-20 rounded-2xl border bg-card/95 p-2 shadow-lg backdrop-blur"
					>
						{action}
					</div>
				) : (
					action
				))}
			{entries.length === 0 ? (
				<p className="text-muted-foreground">{t("order.time.empty")}</p>
			) : (
				<ul className="grid divide-y">
					{entries.map((e) => (
						<li key={e.id} className="flex items-center gap-3 py-3">
							<div className="grid min-w-0 flex-1 gap-0.5">
								<Person
									name={names.get(e.technicianId) ?? t("values.someone")}
								/>
								<span className="pl-12 text-sm text-muted-foreground">
									{formatDay(localDate(new Date(e.startedAt)))} ·{" "}
									{clock(e.startedAt)}–
									{e.endedAt ? clock(e.endedAt) : t("order.time.now")}
								</span>
							</div>
							<span className="font-semibold tabular-nums">
								{formatMinutes(minutesBetween(e.startedAt, e.endedAt, now))}
							</span>
							{office && (
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={t("order.time.remove", {
										time: clock(e.startedAt),
									})}
									onPress={() =>
										void loop.mutate({
											entityType: TIME_ENTRY,
											entityId: e.id,
											kind: "delete",
										})
									}
								>
									<X aria-hidden />
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}
