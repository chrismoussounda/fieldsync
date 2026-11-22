import { type EntityState, isDeleted } from "@fieldsync/merge";
import {
	canManage,
	editableFields,
	STATUSES,
	WORK_ORDER,
} from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import {
	ArrowLeft,
	Building2,
	CalendarDays,
	ChevronDown,
	FileText,
	Flame,
	KeyRound,
	MapPin,
	Navigation,
	Pencil,
	Phone,
	Trash2,
	UserRound,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Confirm } from "@/components/confirm";
import { Section } from "@/components/section";
import { StatusBadge } from "@/components/status-badge";
import { Button, LinkButton } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDay } from "@/lib/format";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import { itemsOf } from "../app/checklists.ts";
import { ROUTES } from "../app/route.ts";
import { type Site, sitesOf, telLink } from "../app/sites.ts";
import type { Member } from "../app/workspace.ts";
import type { Session, User } from "../auth/session.ts";
import { isOverdue, localDate } from "../filters.ts";
import { type Order, priorityLabel, statusLabel, toOrder } from "../orders.ts";
import type { SyncLoop } from "../sync/loop.ts";
import type { LocalDb } from "../sync/storage.ts";
import { OrderChecklist } from "./OrderChecklist.tsx";
import { OrderHistory } from "./OrderHistory.tsx";
import { OrderParts } from "./OrderParts.tsx";
import { OrderPhotos } from "./OrderPhotos.tsx";
import { OrderSheet } from "./OrderSheet.tsx";
import { OrderSignature } from "./OrderSignature.tsx";
import { OrderTime } from "./OrderTime.tsx";

type Props = {
	db: LocalDb;
	loop: SyncLoop;
	session: Session;
	user: User;
	id: string;
};

/** A work order: what to do, where, and everything recorded on site. */
export function OrderDetail({ db, loop, session, user, id }: Props) {
	const { t } = useTranslation();
	const state = useLiveQuery(
		async () => (await db.entities.get([WORK_ORDER, id]))?.state ?? null,
		[db, id],
	);
	const sites = useLiveQuery(() => sitesOf(db), [db]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const edit = useSheet<true>();
	const [deleting, setDeleting] = useState(false);

	if (state === undefined) return null;
	const order = state && !isDeleted(state) ? toOrder(id, state) : null;
	if (!state || !order) {
		return (
			<div className="grid place-items-center gap-3 rounded-2xl border border-dashed p-12 text-center">
				<p className="font-medium">{t("order.gone")}</p>
				<BackLink />
			</div>
		);
	}
	const editable = editableFields(user, state.fields);
	const office = canManage(user.role);
	const site = sites?.find((s) => s.id === order.siteId) ?? null;
	const assignee = order.assigneeId
		? (members?.find((m) => m.id === order.assigneeId)?.name ?? null)
		: null;
	const sections = { db, loop, user, orderId: id, order: state.fields };

	async function remove() {
		await loop.mutate({ entityType: WORK_ORDER, entityId: id, kind: "delete" });
		toast.success(t("order.deleted"));
		window.location.hash = ROUTES.list;
	}

	async function setStatus(status: string) {
		await loop.mutate({
			entityType: WORK_ORDER,
			entityId: id,
			patch: { status },
		});
		toast.success(t("order.statusChanged", { status: statusLabel(status) }));
		if (status === "done") {
			const unticked = (await itemsOf(db, id)).filter((i) => !i.done).length;
			if (unticked > 0) toast.warning(t("order.unticked", { count: unticked }));
		}
	}

	return (
		<div className="grid grid-cols-1 gap-6">
			<BackLink />
			<header className="grid gap-4">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words md:text-3xl">
						{order.title}
					</h1>
					<div className="flex flex-wrap gap-2">
						<LinkButton
							href={ROUTES.report(id)}
							variant="outline"
							className="bg-card"
						>
							<FileText aria-hidden />
							{t("order.report")}
						</LinkButton>
						{editable.size > 0 && (
							<Button
								variant="outline"
								className="bg-card"
								onPress={() => edit.show(true)}
							>
								<Pencil aria-hidden />
								{t("order.edit")}
							</Button>
						)}
						{office && (
							<Button
								variant="destructive"
								aria-label={t("order.delete")}
								onPress={() => setDeleting(true)}
							>
								<Trash2 aria-hidden />
								<span className="max-sm:hidden">{t("order.delete")}</span>
							</Button>
						)}
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground">
					{editable.has("status") ? (
						<StatusMenu status={order.status} onPick={setStatus} />
					) : (
						<StatusBadge status={order.status} />
					)}
					{order.priority === "urgent" && (
						<span className="flex items-center gap-1.5 font-medium text-status-urgent">
							<Flame aria-hidden className="size-4" />
							{priorityLabel(order.priority)}
						</span>
					)}
					<Meta icon={<CalendarDays />} label={t("order.due")}>
						<Due order={order} />
					</Meta>
					<Meta icon={<UserRound />} label={t("order.technician")}>
						{assignee ?? t("orders.unassigned")}
					</Meta>
				</div>
				{editable.size === 0 && (
					<p className="rounded-xl bg-muted p-3 text-muted-foreground">
						{t("order.readOnly")}
					</p>
				)}
			</header>
			<div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_28rem]">
				<div className="grid grid-cols-1 gap-6">
					<Place order={order} site={site} className="lg:hidden" />
					<Text order={order} />
					<OrderChecklist {...sections} />
					<OrderParts {...sections} />
					<OrderPhotos {...sections} />
					<OrderSignature {...sections} />
				</div>
				<aside className="grid grid-cols-1 gap-6">
					<Place order={order} site={site} className="max-lg:hidden" />
					<OrderTime {...sections} />
					<OrderHistory
						db={db}
						session={session}
						id={id}
						stamp={latestStamp(state)}
					/>
				</aside>
			</div>
			{edit.value && (
				<OrderSheet
					key={edit.key}
					open={edit.open}
					onOpenChange={(open) => !open && edit.hide()}
					db={db}
					loop={loop}
					user={user}
					order={{ id, state }}
				/>
			)}
			<Confirm
				open={deleting}
				onOpenChange={setDeleting}
				title={t("order.deleteTitle")}
				description={t("order.deleteBody")}
				confirmLabel={t("order.delete")}
				onConfirm={() => void remove()}
			/>
		</div>
	);
}

// Clock stamps sort by time, so the largest is the latest change.
function latestStamp(state: EntityState): string {
	return [
		...Object.values(state.clocks),
		state.deletedHlc ?? "",
		state.restoredHlc ?? "",
	].reduce((a, b) => (b > a ? b : a), "");
}

function BackLink() {
	const { t } = useTranslation();
	return (
		<a
			href={ROUTES.list}
			className="flex w-fit items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"
		>
			<ArrowLeft aria-hidden className="size-4" />
			{t("order.back")}
		</a>
	);
}

function Meta({
	icon,
	label,
	children,
}: {
	icon: ReactNode;
	label: string;
	children: ReactNode;
}) {
	return (
		<span className="flex items-center gap-1.5">
			<span aria-hidden className="[&_svg]:size-4">
				{icon}
			</span>
			<span className="sr-only">{label}</span>
			{children}
		</span>
	);
}

function Due({ order }: { order: Order }) {
	const { t } = useTranslation();
	if (!order.dueDate) return <span>{t("orders.noDate")}</span>;
	const late = isOverdue(order, localDate());
	return (
		<span className={cn(late && "font-medium text-destructive")}>
			{formatDay(order.dueDate)}
			{late && ` · ${t("orders.overdue")}`}
		</span>
	);
}

function StatusMenu({
	status,
	onPick,
}: {
	status: string;
	onPick: (status: string) => Promise<void>;
}) {
	const { t } = useTranslation();
	return (
		<DropdownMenuTrigger>
			<Button
				variant="ghost"
				className="h-auto gap-1 rounded-full p-0 hover:bg-transparent"
				aria-label={t("order.changeStatus", { status: statusLabel(status) })}
			>
				<StatusBadge status={status} />
				<ChevronDown aria-hidden className="size-4 text-muted-foreground" />
			</Button>
			<DropdownMenu
				className="min-w-52"
				selectionMode="single"
				selectedKeys={[status]}
			>
				{STATUSES.map((s) => (
					<DropdownMenuItem key={s} id={s} onAction={() => void onPick(s)}>
						{statusLabel(s)}
					</DropdownMenuItem>
				))}
			</DropdownMenu>
		</DropdownMenuTrigger>
	);
}

/** Where to go and who to ask for, read before leaving. */
function Place({
	order,
	site,
	className,
}: {
	order: Order;
	site: Site | null;
	className?: string;
}) {
	const { t } = useTranslation();
	const address = order.address || site?.address || "";
	if (!site && !address) return null;
	return (
		<div className={className}>
			<Section title={t("order.site")}>
				{site && (
					<div className="flex items-center gap-3">
						<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
							<Building2 aria-hidden className="size-5" />
						</span>
						<div className="grid min-w-0">
							<span className="truncate font-semibold">{site.name}</span>
							<a
								href={ROUTES.site(site.id)}
								className="w-fit text-sm font-medium"
							>
								{t("order.sitePage")}
							</a>
						</div>
					</div>
				)}
				{address && (
					<p className="flex gap-2">
						<MapPin
							aria-hidden
							className="mt-0.5 size-4 shrink-0 text-muted-foreground"
						/>
						{address}
					</p>
				)}
				{site?.contactName && (
					<p className="flex items-center gap-2">
						<UserRound
							aria-hidden
							className="size-4 shrink-0 text-muted-foreground"
						/>
						{site.contactName}
						{site.contactPhone && (
							<a href={telLink(site.contactPhone)}>{site.contactPhone}</a>
						)}
					</p>
				)}
				{site?.accessNotes && (
					<p className="flex gap-2 rounded-xl bg-warning/10 p-3 whitespace-pre-line">
						<KeyRound aria-hidden className="mt-0.5 size-4 shrink-0" />
						{site.accessNotes}
					</p>
				)}
				<div className="grid grid-cols-2 gap-2">
					{site?.contactPhone && (
						<LinkButton href={telLink(site.contactPhone)} className="h-11">
							<Phone aria-hidden />
							{t("order.call")}
						</LinkButton>
					)}
					{address && (
						<LinkButton
							href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
							target="_blank"
							rel="noreferrer"
							variant="outline"
							className={cn("h-11", !site?.contactPhone && "col-span-2")}
						>
							<Navigation aria-hidden />
							{t("order.directions")}
						</LinkButton>
					)}
				</div>
			</Section>
		</div>
	);
}

function Text({ order }: { order: Order }) {
	const { t } = useTranslation();
	return (
		<div className="grid gap-6 md:grid-cols-2">
			<Section title={t("order.description")}>
				<p
					className={cn(
						"whitespace-pre-line",
						!order.description && "text-muted-foreground",
					)}
				>
					{order.description || t("order.noDescription")}
				</p>
			</Section>
			<Section title={t("order.notes")}>
				<p
					className={cn(
						"whitespace-pre-line",
						!order.notes && "text-muted-foreground",
					)}
				>
					{order.notes || t("order.noNotes")}
				</p>
			</Section>
		</div>
	);
}
