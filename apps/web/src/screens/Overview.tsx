import { formatMinutes } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import {
	AlarmClock,
	ArrowRight,
	CalendarClock,
	Flame,
	type LucideIcon,
	UserX,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { columnHelper, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/person";
import { LinkButton } from "@/components/ui/button";
import { usePhone } from "@/lib/use-phone";
import { cn } from "@/lib/utils";
import { ROUTES } from "../app/route.ts";
import { entriesOf, minutesByTechnician } from "../app/timesheet.ts";
import type { Member } from "../app/workspace.ts";
import {
	type Filters,
	isFinished,
	isOverdue,
	localDate,
	toQuery,
} from "../filters.ts";
import { type Order, statusLabel, toOrder, WORK_ORDER } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";

const link = (f: Partial<Filters>) => ROUTES.filtered(toQuery(f));

const BAR: Record<string, string> = {
	open: "bg-status-open",
	assigned: "bg-status-active",
	in_progress: "bg-warning",
};

type Load = {
	member: Member;
	total: number;
	started: number;
	late: number;
	urgent: number;
	week: number;
};

/** Where the work stands, from this device's copy, so it works offline too. */
export function Overview({ db }: { db: LocalDb }) {
	const { t } = useTranslation();
	const phone = usePhone();
	const rows = useLiveQuery(() => db.entities.toArray(), [db]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const entries = useLiveQuery(() => entriesOf(db), [db]);
	if (!rows) return null;

	const today = localDate();
	const now = Date.now();
	const worked = minutesByTechnician(entries ?? [], now - 7 * 86_400_000, now);
	const active = rows
		.filter((r) => r.type === WORK_ORDER)
		.map((r) => toOrder(r.id, r.state))
		.filter((o): o is Order => o !== null && !isFinished(o));
	const count = (test: (o: Order) => boolean) => active.filter(test).length;

	// `alert`: anything here needs the office's attention.
	const tiles: {
		label: string;
		value: number;
		href: string;
		icon: LucideIcon;
		alert: boolean;
	}[] = [
		{
			label: t("overview.unassigned"),
			value: count((o) => o.assigneeId === null),
			href: link({ assignee: "none" }),
			icon: UserX,
			alert: true,
		},
		{
			label: t("overview.overdue"),
			value: count((o) => isOverdue(o, today)),
			href: link({ assignee: "all", due: "overdue" }),
			icon: AlarmClock,
			alert: true,
		},
		{
			label: t("overview.today"),
			value: count((o) => o.dueDate === today),
			href: link({ assignee: "all", due: "today" }),
			icon: CalendarClock,
			alert: false,
		},
		{
			label: t("overview.urgent"),
			value: count((o) => o.priority === "urgent"),
			href: link({ assignee: "all", urgentOnly: true }),
			icon: Flame,
			alert: true,
		},
	];
	const statuses = (["open", "assigned", "in_progress"] as const).map((s) => ({
		status: s,
		value: count((o) => o.status === s),
	}));

	// Disabled technicians only show while they still hold work.
	const technicians = (members ?? []).filter(
		(m) =>
			m.role === "technician" &&
			(m.active || active.some((o) => o.assigneeId === m.id)),
	);
	const load: Load[] = technicians
		.map((m) => {
			const theirs = active.filter((o) => o.assigneeId === m.id);
			return {
				member: m,
				total: theirs.length,
				started: theirs.filter((o) => o.status === "in_progress").length,
				late: theirs.filter((o) => isOverdue(o, today)).length,
				urgent: theirs.filter((o) => o.priority === "urgent").length,
				week: worked.get(m.id) ?? 0,
			};
		})
		.sort((a, b) => b.late - a.late || b.total - a.total);

	return (
		<div className="grid grid-cols-1 gap-8">
			<PageHeader
				title={t("overview.title")}
				description={t("overview.description")}
				actions={
					<LinkButton
						href={link({ assignee: "all" })}
						variant="outline"
						className="bg-card"
					>
						{t("overview.allActive")}
						<ArrowRight aria-hidden />
					</LinkButton>
				}
			/>
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
				{tiles.map(({ label, value, href, icon: Icon, alert }) => (
					<a
						key={label}
						href={href}
						className={cn(
							"grid gap-3 rounded-2xl border bg-card p-5 text-foreground transition-colors hover:border-primary/50",
							alert && value > 0 && "border-destructive/30 bg-destructive/5",
						)}
					>
						<Icon
							aria-hidden
							className={cn(
								"size-6",
								alert && value > 0
									? "text-destructive"
									: "text-muted-foreground",
							)}
						/>
						<span className="text-4xl font-semibold tabular-nums">{value}</span>
						<span className="font-medium text-muted-foreground">{label}</span>
					</a>
				))}
			</div>
			<section className="grid gap-4 rounded-2xl border bg-card p-6">
				<h2 className="text-lg font-semibold">{t("overview.byStatus")}</h2>
				<div className="flex h-3 overflow-hidden rounded-full bg-muted">
					{statuses.map(({ status, value }) => (
						<span
							key={status}
							className={BAR[status]}
							style={{ flexGrow: value }}
						/>
					))}
				</div>
				<div className="flex flex-wrap gap-x-6 gap-y-2">
					{statuses.map(({ status, value }) => (
						<a
							key={status}
							href={link({ assignee: "all", status })}
							className="flex items-center gap-2 font-medium text-foreground hover:underline"
						>
							<span
								aria-hidden
								className={cn("size-3 rounded-full", BAR[status])}
							/>
							{statusLabel(status)}
							<span className="text-muted-foreground tabular-nums">
								{value}
							</span>
						</a>
					))}
				</div>
			</section>
			<section className="grid gap-4">
				<h2 className="text-lg font-semibold">{t("overview.technicians")}</h2>
				{phone ? <LoadCards load={load} /> : <LoadTable load={load} />}
			</section>
		</div>
	);
}

function Name({ member }: { member: Member }) {
	const { t } = useTranslation();
	return (
		<span className="flex items-center gap-2">
			<a
				href={link({ assignee: member.id })}
				className="font-medium text-foreground hover:underline"
			>
				<Person name={member.name} />
			</a>
			{!member.active && (
				<span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-sm text-destructive">
					{t("overview.disabled")}
				</span>
			)}
		</span>
	);
}

const Late = ({ value }: { value: number }) => (
	<span
		className={cn(
			"tabular-nums",
			value > 0 && "font-semibold text-destructive",
		)}
	>
		{value}
	</span>
);

const hours = (minutes: number) => (minutes > 0 ? formatMinutes(minutes) : "–");

function LoadTable({ load }: { load: Load[] }) {
	const { t } = useTranslation();
	const helper = columnHelper<Load>();
	const columns = helper.columns([
		helper.accessor((l) => l.member.name, {
			id: "technician",
			header: t("orders.technician"),
			cell: ({ row }) => <Name member={row.original.member} />,
		}),
		helper.accessor("total", { header: t("overview.active") }),
		helper.accessor("started", { header: t("overview.started") }),
		helper.accessor("late", {
			header: t("overview.overdue"),
			cell: ({ row }) => <Late value={row.original.late} />,
		}),
		helper.accessor("urgent", { header: t("overview.urgent") }),
		helper.accessor("week", {
			header: t("overview.week"),
			cell: ({ row }) => hours(row.original.week),
		}),
	]);
	return (
		<DataTable
			label={t("overview.technicians")}
			data={load}
			columns={columns}
			getRowId={(l) => l.member.id}
			empty={t("overview.noTechnicians")}
		/>
	);
}

function LoadCards({ load }: { load: Load[] }) {
	const { t } = useTranslation();
	if (load.length === 0) {
		return (
			<p className="text-muted-foreground">{t("overview.noTechnicians")}</p>
		);
	}
	const stats = (l: Load) => [
		[t("overview.active"), l.total],
		[t("overview.started"), l.started],
		[t("overview.overdue"), <Late key="late" value={l.late} />],
		[t("overview.week"), hours(l.week)],
	];
	return (
		<ul className="grid gap-2.5">
			{load.map((l) => (
				<li
					key={l.member.id}
					className="grid gap-4 rounded-2xl border bg-card p-5"
				>
					<Name member={l.member} />
					<dl className="grid grid-cols-4 gap-2 text-center">
						{stats(l).map(([label, value]) => (
							<div key={String(label)} className="grid gap-1">
								<dt className="text-xs text-muted-foreground">{label}</dt>
								<dd className="text-lg font-semibold tabular-nums">{value}</dd>
							</div>
						))}
					</dl>
				</li>
			))}
		</ul>
	);
}
