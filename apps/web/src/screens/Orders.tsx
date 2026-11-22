import { canManage, STATUSES } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import {
	CalendarDays,
	CloudOff,
	ListChecks,
	Plus,
	Search,
	SlidersHorizontal,
	UserRound,
	X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { columnHelper, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/person";
import { SelectField } from "@/components/select-field";
import { StatusBadge } from "@/components/status-badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatDay } from "@/lib/format";
import { usePhone } from "@/lib/use-phone";
import { cn } from "@/lib/utils";
import { itemsOf, progressByOrder } from "../app/checklists.ts";
import { ROUTES } from "../app/route.ts";
import type { Member } from "../app/workspace.ts";
import type { User } from "../auth/session.ts";
import {
	DEFAULT_FILTERS,
	type Filters,
	fromQuery,
	isOverdue,
	localDate,
	matches,
} from "../filters.ts";
import { byUrgency, type Order, toOrder, WORK_ORDER } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";

const SAVED = "fieldsync.filters";

function defaults(user: User): Filters {
	return {
		...DEFAULT_FILTERS,
		...(user.role === "technician" ? { assignee: "me" } : {}),
	};
}

// A link's filters win; otherwise the ones used last in this tab.
function initial(user: User, query: string | null): Filters {
	if (query !== null) return { ...defaults(user), ...fromQuery(query) };
	try {
		const saved = sessionStorage.getItem(SAVED);
		if (saved) return { ...defaults(user), ...JSON.parse(saved) };
	} catch {
		// Storage can be blocked; the defaults do.
	}
	return defaults(user);
}

/** Left edge color of a job, by how it is going. */
const STRIPE: Record<string, string> = {
	open: "bg-status-open",
	assigned: "bg-status-active",
	in_progress: "bg-warning",
	done: "bg-status-done",
	cancelled: "bg-muted-foreground/40",
};

type Props = { db: LocalDb; user: User; query: string | null };
type Row = Order & {
	assignee: string | null;
	late: boolean;
	waiting: boolean;
	progress: { done: number; total: number } | null;
};

export function Orders({ db, user, query }: Props) {
	const { t } = useTranslation();
	const phone = usePhone();
	const [filters, setFilters] = useState(() => initial(user, query));
	const [filtering, setFiltering] = useState(false);
	const rows = useLiveQuery(() => db.entities.toArray(), [db]);
	const outbox = useLiveQuery(() => db.outbox.toArray(), [db]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const checklists = useLiveQuery(
		async () => progressByOrder(await itemsOf(db)),
		[db],
	);

	const set = (change: Partial<Filters>) => {
		const next = { ...filters, ...change };
		setFilters(next);
		try {
			sessionStorage.setItem(SAVED, JSON.stringify(next));
		} catch {
			// Only a convenience.
		}
	};

	if (!rows) return null;
	const waiting = new Set(
		outbox?.filter((r) => r.status !== "dead").map((r) => r.entityId),
	);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const today = localDate();
	const all = rows
		.filter((r) => r.type === WORK_ORDER)
		.map((r) => toOrder(r.id, r.state))
		.filter((o) => o !== null);
	const ctx = { userId: user.id, today, names };
	const orders: Row[] = all
		.filter((o) => matches(o, filters, ctx))
		.sort(byUrgency)
		.map((o) => ({
			...o,
			assignee: o.assigneeId ? (names.get(o.assigneeId) ?? null) : null,
			late: isOverdue(o, today),
			waiting: waiting.has(o.id),
			progress: checklists?.get(o.id) ?? null,
		}));
	const technicians =
		members?.filter((m) => m.role === "technician" && m.active) ?? [];
	const changed = JSON.stringify(filters) !== JSON.stringify(defaults(user));
	const active = [
		filters.status !== defaults(user).status,
		filters.assignee !== defaults(user).assignee,
		filters.due !== "any",
		filters.urgentOnly,
	].filter(Boolean).length;

	const controls = (
		<>
			<SelectField
				id="filter-status"
				ariaLabel={t("orders.status")}
				label={phone ? t("orders.status") : undefined}
				placeholder={t("orders.status")}
				value={filters.status}
				onChange={(status) => set({ status })}
				options={[
					{ value: "active", label: t("orders.activeWork") },
					{ value: "all", label: t("orders.anyStatus") },
					...STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
				]}
				className="md:w-44"
			/>
			<SelectField
				id="filter-assignee"
				ariaLabel={t("orders.assignee")}
				label={phone ? t("orders.assignee") : undefined}
				placeholder={t("orders.assignee")}
				value={filters.assignee}
				onChange={(assignee) => set({ assignee })}
				options={[
					{ value: "all", label: t("orders.anyone") },
					{ value: "me", label: t("orders.me") },
					{ value: "none", label: t("orders.unassigned") },
					...technicians
						.filter((m) => m.id !== user.id)
						.map((m) => ({ value: m.id, label: m.name })),
				]}
				className="md:w-48"
			/>
			<SelectField
				id="filter-due"
				ariaLabel={t("orders.due")}
				label={phone ? t("orders.due") : undefined}
				placeholder={t("orders.due")}
				value={filters.due}
				onChange={(due) => set({ due: due as Filters["due"] })}
				options={[
					{ value: "any", label: t("orders.anyDate") },
					{ value: "overdue", label: t("orders.overdue") },
					{ value: "today", label: t("orders.today") },
					{ value: "week", label: t("orders.week") },
				]}
				className="md:w-44"
			/>
			<Switch
				isSelected={filters.urgentOnly}
				onChange={(urgentOnly) => set({ urgentOnly })}
				className="gap-2 text-sm font-medium whitespace-nowrap"
			>
				{t("orders.urgentOnly")}
			</Switch>
		</>
	);

	return (
		<div className="grid gap-5">
			<PageHeader
				title={t("orders.title")}
				description={t("orders.shown", {
					shown: orders.length,
					total: all.length,
				})}
				actions={
					canManage(user.role) &&
					(phone ? (
						<LinkButton
							href={ROUTES.new}
							aria-label={t("orders.new")}
							className="fixed right-4 bottom-24 z-20 size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6"
						>
							<Plus aria-hidden />
						</LinkButton>
					) : (
						<LinkButton href={ROUTES.new} className="h-10 px-4">
							<Plus aria-hidden />
							{t("orders.new")}
						</LinkButton>
					))
				}
			/>
			<div className="flex flex-wrap items-center gap-3">
				<div className="relative min-w-0 flex-1 md:max-w-md md:min-w-72">
					<Search
						aria-hidden
						className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						type="search"
						aria-label={t("common.search")}
						placeholder={t("orders.search")}
						value={filters.text}
						onChange={(e) => set({ text: e.target.value })}
						className="h-10 bg-card pl-9"
					/>
				</div>
				{phone ? (
					<Button
						variant="outline"
						className="h-10 bg-card px-3"
						onPress={() => setFiltering(true)}
					>
						<SlidersHorizontal aria-hidden />
						{t("orders.filters")}
						{active > 0 && (
							<span className="grid size-5 place-items-center rounded-full bg-primary text-xs text-primary-foreground">
								{active}
							</span>
						)}
					</Button>
				) : (
					controls
				)}
				{changed && !phone && (
					<Button
						variant="ghost"
						className="h-10 text-muted-foreground"
						onPress={() => set(defaults(user))}
					>
						<X aria-hidden />
						{t("orders.clear")}
					</Button>
				)}
			</div>
			{phone ? (
				<PhoneList orders={orders} empty={empty()} />
			) : (
				<OrderTable orders={orders} empty={empty()} />
			)}
			{phone && (
				<Drawer open={filtering} onOpenChange={setFiltering}>
					<DrawerContent>
						<div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />
						<div className="grid gap-5 overflow-y-auto px-5 pt-3 pb-4">
							<DrawerTitle className="text-lg font-semibold">
								{t("orders.filters")}
							</DrawerTitle>
							{controls}
						</div>
						<div className="flex gap-2 border-t px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
							<Button
								variant="outline"
								className="h-11 flex-1"
								onPress={() => set(defaults(user))}
							>
								{t("orders.clear")}
							</Button>
							<Button
								className="h-11 flex-1"
								onPress={() => setFiltering(false)}
							>
								{t("orders.apply")}
							</Button>
						</div>
					</DrawerContent>
				</Drawer>
			)}
		</div>
	);

	function empty() {
		return rows?.length === 0 ? t("orders.nothingSynced") : t("orders.noMatch");
	}
}

function Due({ order }: { order: Row }) {
	const { t } = useTranslation();
	if (!order.dueDate) {
		return <span className="text-muted-foreground">{t("orders.noDate")}</span>;
	}
	return (
		<span
			className={cn(
				"flex items-center gap-1.5",
				order.late && "font-medium text-destructive",
			)}
		>
			{formatDay(order.dueDate)}
			{order.late && (
				<span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs">
					{t("orders.overdue")}
				</span>
			)}
		</span>
	);
}

function Progress({ progress }: { progress: Row["progress"] }) {
	if (!progress) return <span className="text-muted-foreground">—</span>;
	const ratio = progress.total ? progress.done / progress.total : 0;
	return (
		<span className="flex items-center gap-2">
			<span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
				<span
					className="block h-full rounded-full bg-status-done"
					style={{ width: `${ratio * 100}%` }}
				/>
			</span>
			<span className="text-xs text-muted-foreground tabular-nums">
				{progress.done}/{progress.total}
			</span>
		</span>
	);
}

function Title({ order }: { order: Row }) {
	const { t } = useTranslation();
	return (
		<span className="grid min-w-0 gap-0.5">
			<span className="flex items-center gap-2">
				<a
					href={ROUTES.order(order.id)}
					className="truncate font-medium text-foreground after:absolute after:inset-0 hover:underline"
				>
					{order.title}
				</a>
				{order.priority === "urgent" && (
					<span className="shrink-0 rounded-full bg-status-urgent/12 px-2 py-0.5 text-xs font-medium text-status-urgent">
						{t("orders.urgent")}
					</span>
				)}
				{order.waiting && (
					<CloudOff
						aria-label={t("orders.notSynced")}
						className="size-4 shrink-0 text-warning"
					/>
				)}
			</span>
			{order.address && (
				<span className="truncate text-sm text-muted-foreground">
					{order.address}
				</span>
			)}
		</span>
	);
}

function OrderTable({ orders, empty }: { orders: Row[]; empty: string }) {
	const { t } = useTranslation();
	const helper = columnHelper<Row>();
	const columns = helper.columns([
		helper.accessor("title", {
			header: t("orders.job"),
			cell: ({ row }) => <Title order={row.original} />,
			meta: { className: "max-w-[28rem] whitespace-normal" },
		}),
		helper.accessor("status", {
			header: t("orders.status"),
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		}),
		helper.accessor((o) => o.dueDate ?? "", {
			id: "due",
			header: t("orders.due"),
			cell: ({ row }) => <Due order={row.original} />,
		}),
		helper.accessor((o) => o.assignee ?? "", {
			id: "assignee",
			header: t("orders.technician"),
			cell: ({ row }) =>
				row.original.assignee ? (
					<Person name={row.original.assignee} />
				) : (
					<span className="text-muted-foreground">
						{t("orders.unassigned")}
					</span>
				),
		}),
		helper.display({
			id: "checklist",
			header: t("orders.checklist"),
			cell: ({ row }) => <Progress progress={row.original.progress} />,
		}),
	]);
	return (
		<DataTable
			label={t("orders.title")}
			data={orders}
			columns={columns}
			getRowId={(o) => o.id}
			empty={empty}
		/>
	);
}

function PhoneList({ orders, empty }: { orders: Row[]; empty: string }) {
	const { t } = useTranslation();
	if (orders.length === 0) {
		return (
			<p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
				{empty}
			</p>
		);
	}
	return (
		<ul className="grid gap-2.5">
			{orders.map((o) => (
				<li
					key={o.id}
					className="relative flex overflow-hidden rounded-2xl border bg-card"
				>
					<span
						aria-hidden
						className={cn("w-1.5 shrink-0", STRIPE[o.status])}
					/>
					<div className="grid min-w-0 flex-1 gap-2 p-4">
						<Title order={o} />
						<div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
							<StatusBadge status={o.status} />
							<span className="flex items-center gap-1.5">
								<CalendarDays aria-hidden className="size-4" />
								<Due order={o} />
							</span>
							{o.progress && (
								<span className="flex items-center gap-1.5">
									<ListChecks aria-hidden className="size-4" />
									<Progress progress={o.progress} />
								</span>
							)}
							<span className="flex items-center gap-1.5">
								<UserRound aria-hidden className="size-4" />
								{o.assignee ?? t("orders.unassigned")}
							</span>
						</div>
					</div>
				</li>
			))}
		</ul>
	);
}
