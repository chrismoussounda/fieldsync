import { WORK_ORDER } from "@fieldsync/work-orders";
import { cn } from "cn";
import { useLiveQuery } from "dexie-react-hooks";
import {
	CalendarClock,
	ChevronLeft,
	ChevronRight,
	MoveRight,
	UserRoundX,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { type DragTypes, useDrag, useDrop } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DateField } from "@/components/date-field";
import { FormSheet } from "@/components/form-sheet";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/person";
import { SelectField } from "@/components/select-field";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ITEM_IN } from "@/lib/use-leaving";
import { usePhone } from "@/lib/use-phone";
import { useSheet } from "@/lib/use-sheet";
import { ROUTES } from "../app/route.ts";
import {
	boardOf,
	canMove,
	cellKey,
	daysFrom,
	moveOf,
	type Slot,
	weekOf,
} from "../app/schedule.ts";
import type { Member } from "../app/workspace.ts";
import { addDays, isOverdue, localDate } from "../filters.ts";
import { type Order, toOrder } from "../orders.ts";
import type { SyncLoop } from "../sync/loop.ts";
import type { LocalDb } from "../sync/storage.ts";

/** What a dragged job carries, so other drags (files, text) are refused. */
const JOB = "application/x-fieldsync-order";
const NONE = "none";

const asDate = (day: string) => {
	const [y, m, d] = day.split("-").map(Number);
	return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
};

type Props = { db: LocalDb; loop: SyncLoop; day: string | null };

/** The office's week: who does what, and when; jobs move by drag or by sheet. */
export function Schedule({ db, loop, day }: Props) {
	const { t, i18n } = useTranslation();
	const phone = usePhone();
	const today = localDate();
	const shown = day ?? today;
	const rows = useLiveQuery(() => db.ofType(WORK_ORDER), [db]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const moving = useSheet<Order>();
	if (!rows) return null;

	const orders = rows.flatMap((r) => toOrder(r.id, r.state) ?? []);
	const byId = new Map(orders.map((o) => [o.id, o]));
	const days = phone ? [shown] : daysFrom(weekOf(shown));
	const board = boardOf(orders, days);
	const busy = new Set(
		[...board.cells.values()].flat().map((o) => o.assigneeId),
	);
	// Disabled technicians drop off the board once they have nothing on it.
	const technicians =
		members?.filter(
			(m) => m.role === "technician" && (m.active !== false || busy.has(m.id)),
		) ?? [];
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const go = (to: string) => {
		window.location.hash = ROUTES.schedule(to);
	};
	const step = phone ? 1 : 7;
	const label = (d: string, options: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat(i18n.language, options).format(asDate(d));
	const range = phone
		? label(shown, { weekday: "long", day: "numeric", month: "long" })
		: new Intl.DateTimeFormat(i18n.language, {
				day: "numeric",
				month: "short",
				year: "numeric",
			}).formatRange(asDate(days[0] ?? shown), asDate(days.at(-1) ?? shown));

	async function move(order: Order, to: Slot) {
		const patch = moveOf(order, to);
		if (Object.keys(patch).length === 0) return;
		await loop.mutate({ entityType: WORK_ORDER, entityId: order.id, patch });
		const moved: Order = {
			...order,
			assigneeId: to.assigneeId,
			dueDate: to.dueDate,
			status: patch.status ?? order.status,
		};
		const back = moveOf(moved, order);
		toast.success(
			t("schedule.moved", {
				title: order.title,
				who: to.assigneeId
					? (names.get(to.assigneeId) ?? t("values.someone"))
					: t("schedule.nobody"),
				when: to.dueDate
					? label(to.dueDate, {
							weekday: "long",
							day: "numeric",
							month: "long",
						})
					: t("schedule.noDate"),
			}),
			{
				action: {
					label: t("schedule.undo"),
					onClick: () =>
						void loop.mutate({
							entityType: WORK_ORDER,
							entityId: order.id,
							patch: back,
						}),
				},
			},
		);
	}

	const dropped = (to: Slot) => (id: string) => {
		const order = byId.get(id);
		if (order && canMove(order)) void move(order, to);
	};
	const card = (order: Order) => (
		<JobCard
			key={order.id}
			order={order}
			late={isOverdue(order, today)}
			onMove={() => moving.show(order)}
		/>
	);
	const lanes: { id: string | null; head: ReactNode }[] = [
		{
			id: null,
			head: (
				<span className="flex items-center gap-3 text-muted-foreground">
					<span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
						<UserRoundX aria-hidden className="size-4" />
					</span>
					{t("schedule.unassigned")}
				</span>
			),
		},
		...technicians.map((m) => ({
			id: m.id,
			head: (
				<Person
					name={m.name}
					detail={t(phone ? "schedule.loadDay" : "schedule.loadWeek", {
						count: days.reduce(
							(n, d) => n + (board.cells.get(cellKey(m.id, d))?.length ?? 0),
							0,
						),
					})}
				/>
			),
		})),
	];

	const shownRange = (
		<p
			key={days[0]}
			aria-live="polite"
			className="animate-in text-lg font-semibold capitalize duration-300 fade-in-0"
		>
			{range}
		</p>
	);

	return (
		<div className="grid grid-cols-1 gap-6">
			<PageHeader
				title={t("schedule.title")}
				description={phone ? t("schedule.phoneHint") : t("schedule.hint")}
				actions={
					<div className="flex items-center gap-2">
						{!phone && <div className="mr-2">{shownRange}</div>}
						<Button
							variant="outline"
							size="icon"
							aria-label={
								phone ? t("schedule.previousDay") : t("schedule.previousWeek")
							}
							onPress={() => go(addDays(shown, -step))}
						>
							<ChevronLeft aria-hidden />
						</Button>
						<Button variant="outline" onPress={() => go(today)}>
							{t("schedule.today")}
						</Button>
						<Button
							variant="outline"
							size="icon"
							aria-label={
								phone ? t("schedule.nextDay") : t("schedule.nextWeek")
							}
							onPress={() => go(addDays(shown, step))}
						>
							<ChevronRight aria-hidden />
						</Button>
					</div>
				}
			/>
			{phone && shownRange}
			{phone ? (
				<div className="grid gap-5">
					{lanes.map((lane) => {
						const jobs = board.cells.get(cellKey(lane.id, shown)) ?? [];
						if (lane.id === null && jobs.length === 0) return null;
						return (
							<section
								key={lane.id ?? NONE}
								aria-label={
									lane.id ? names.get(lane.id) : t("schedule.unassigned")
								}
								className="grid gap-2.5"
							>
								{lane.head}
								{jobs.length === 0 ? (
									<p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
										{t("schedule.free")}
									</p>
								) : (
									<div className="grid gap-2">{jobs.map(card)}</div>
								)}
							</section>
						);
					})}
					<Unplanned jobs={board.unplanned} card={card} onDrop={null} />
				</div>
			) : (
				<div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_18rem]">
					<div className="overflow-x-auto rounded-2xl border bg-card">
						<table className="w-full min-w-[54rem] table-fixed border-collapse">
							<caption className="sr-only">{t("schedule.title")}</caption>
							<colgroup>
								<col className="w-52 xl:w-60" />
							</colgroup>
							<thead>
								<tr>
									<th
										scope="col"
										className="border-b p-3 text-left text-sm font-medium text-muted-foreground"
									>
										{t("schedule.technician")}
									</th>
									{days.map((d) => (
										<th
											key={d}
											scope="col"
											className={cn(
												"border-b border-l p-3 text-left text-sm font-medium capitalize",
												d === today
													? "bg-primary/8 text-primary"
													: "text-muted-foreground",
											)}
										>
											{label(d, { weekday: "short", day: "numeric" })}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{lanes.map((lane) => (
									<tr key={lane.id ?? NONE}>
										<th
											scope="row"
											className="border-b p-3 text-left align-top font-normal"
										>
											{lane.head}
										</th>
										{days.map((d) => (
											<Cell
												key={d}
												label={t("schedule.cell", {
													who: lane.id
														? (names.get(lane.id) ?? "")
														: t("schedule.unassigned"),
													when: label(d, {
														weekday: "long",
														day: "numeric",
														month: "long",
													}),
												})}
												today={d === today}
												onDrop={dropped({ assigneeId: lane.id, dueDate: d })}
											>
												{(board.cells.get(cellKey(lane.id, d)) ?? []).map(card)}
											</Cell>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<Unplanned
						jobs={board.unplanned}
						card={card}
						onDrop={(id) => {
							const order = byId.get(id);
							if (order && canMove(order)) {
								void move(order, {
									assigneeId: order.assigneeId,
									dueDate: null,
								});
							}
						}}
					/>
				</div>
			)}
			{moving.value && (
				<MoveSheet
					key={moving.key}
					open={moving.open}
					onClose={moving.hide}
					order={moving.value}
					technicians={technicians}
					onSave={async (to) => {
						if (moving.value) await move(moving.value, to);
						moving.hide();
					}}
				/>
			)}
		</div>
	);
}

/** Takes dragged jobs only, and shows where one would land. */
function useJobDrop(onDrop: ((id: string) => void) | null) {
	const ref = useRef<HTMLElement>(null);
	const { dropProps, isDropTarget } = useDrop({
		ref,
		isDisabled: onDrop === null,
		getDropOperation: (types: DragTypes) =>
			types.has(JOB) ? "move" : "cancel",
		async onDrop(event) {
			for (const item of event.items) {
				if (item.kind === "text" && item.types.has(JOB)) {
					onDrop?.(await item.getText(JOB));
				}
			}
		},
	});
	return { ref, dropProps, isDropTarget };
}

function Cell({
	label,
	today,
	onDrop,
	children,
}: {
	label: string;
	today: boolean;
	onDrop: (id: string) => void;
	children: ReactNode;
}) {
	const { ref, dropProps, isDropTarget } = useJobDrop(onDrop);
	return (
		<td
			ref={ref as React.RefObject<HTMLTableCellElement>}
			{...dropProps}
			aria-label={label}
			className={cn(
				"h-24 border-b border-l p-2 align-top transition-colors duration-150",
				today && "bg-primary/4",
				isDropTarget && "bg-primary/10 ring-2 ring-primary ring-inset",
			)}
		>
			<div className="grid gap-2">{children}</div>
		</td>
	);
}

function Unplanned({
	jobs,
	card,
	onDrop,
}: {
	jobs: Order[];
	card: (order: Order) => ReactNode;
	onDrop: ((id: string) => void) | null;
}) {
	const { t } = useTranslation();
	const { ref, dropProps, isDropTarget } = useJobDrop(onDrop);
	return (
		<section
			ref={ref}
			{...dropProps}
			aria-labelledby="unplanned"
			className={cn(
				"-order-1 grid content-start gap-3 rounded-2xl border bg-card p-4 transition-colors duration-150 2xl:order-none",
				isDropTarget && "bg-primary/10 ring-2 ring-primary",
			)}
		>
			<h2 id="unplanned" className="flex items-center gap-2 font-semibold">
				<CalendarClock aria-hidden className="size-4 text-muted-foreground" />
				{t("schedule.unplanned")}
				<span className="ml-auto rounded-full bg-muted px-2 text-sm font-medium tabular-nums">
					{jobs.length}
				</span>
			</h2>
			<p className="text-sm text-muted-foreground">
				{jobs.length === 0
					? t("schedule.allPlanned")
					: t("schedule.unplannedHint")}
			</p>
			{jobs.length > 0 && (
				// One scrolling row, so a long list never pushes the week out of view.
				<div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 2xl:grid 2xl:overflow-visible">
					{jobs.map((job) => (
						<div key={job.id} className="w-60 shrink-0 2xl:w-auto">
							{card(job)}
						</div>
					))}
				</div>
			)}
		</section>
	);
}

const STRIPE: Record<string, string> = {
	urgent: "border-l-status-urgent",
	normal: "border-l-primary/60",
	low: "border-l-muted-foreground/40",
};

function JobCard({
	order,
	late,
	onMove,
}: {
	order: Order;
	late: boolean;
	onMove: () => void;
}) {
	const { t } = useTranslation();
	const movable = canMove(order);
	const { dragProps, isDragging } = useDrag({
		isDisabled: !movable,
		getItems: () => [{ [JOB]: order.id, "text/plain": order.title }],
	});
	return (
		<div
			data-job={order.id}
			className={cn(
				"group relative grid gap-1.5 rounded-lg border border-l-4 bg-background p-2.5 text-sm shadow-xs transition-[opacity,box-shadow] duration-150",
				ITEM_IN,
				STRIPE[order.priority] ?? STRIPE.normal,
				movable ? "hover:shadow-md" : "opacity-70",
				isDragging && "opacity-40",
			)}
		>
			{/* The link covers the card: a click opens the job, a drag moves it. */}
			<a
				{...dragProps}
				href={ROUTES.order(order.id)}
				className={cn(
					"line-clamp-2 font-medium text-foreground after:absolute after:inset-0 after:rounded-lg hover:underline",
					movable && "cursor-grab",
				)}
			>
				{order.title}
			</a>
			<div className="flex flex-wrap items-center gap-1.5">
				<StatusBadge status={order.status} size="sm" />
				{late && (
					<span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
						{t("schedule.late")}
					</span>
				)}
				{movable && (
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t("schedule.moveJob", { title: order.title })}
						className="relative z-10 ml-auto text-muted-foreground"
						onPress={onMove}
					>
						<MoveRight aria-hidden />
					</Button>
				)}
			</div>
		</div>
	);
}

function MoveSheet({
	open,
	onClose,
	order,
	technicians,
	onSave,
}: {
	open: boolean;
	onClose: () => void;
	order: Order;
	technicians: Member[];
	onSave: (to: Slot) => Promise<void>;
}) {
	const { t } = useTranslation();
	const [who, setWho] = useState(order.assigneeId ?? NONE);
	const [when, setWhen] = useState(order.dueDate ?? "");
	return (
		<FormSheet
			open={open}
			onOpenChange={(next) => !next && onClose()}
			title={t("schedule.moveTitle")}
			description={order.title}
			submitLabel={t("schedule.move")}
			onSubmit={() =>
				void onSave({
					assigneeId: who === NONE ? null : who,
					dueDate: when || null,
				})
			}
		>
			<SelectField
				id="move-who"
				label={t("schedule.technician")}
				placeholder={t("schedule.technicianPlaceholder")}
				options={[
					{ value: NONE, label: t("schedule.nobody") },
					...technicians.map((m) => ({ value: m.id, label: m.name })),
				]}
				value={who}
				onChange={setWho}
			/>
			<DateField
				id="move-when"
				label={t("schedule.day")}
				hint={t("schedule.dayHint")}
				clearLabel={t("schedule.clearDay")}
				value={when}
				onChange={setWhen}
			/>
		</FormSheet>
	);
}
