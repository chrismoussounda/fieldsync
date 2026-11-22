import { canManage, STATUSES, WORK_ORDER } from "@fieldsync/work-orders";
import { cn } from "cn";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, MapPin, MapPinOff, Navigation, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DateField } from "@/components/date-field";
import { JobsMap } from "@/components/map";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/person";
import { SelectField } from "@/components/select-field";
import { StatusBadge } from "@/components/status-badge";
import { Button, LinkButton } from "@/components/ui/button";
import { formatDay } from "@/lib/format";
import { directionsUrl } from "@/lib/maps";
import { ITEM_IN } from "@/lib/use-leaving";
import { ALL, jobsOnMap, type MapFilters, type Pin } from "../app/map.ts";
import { ROUTES } from "../app/route.ts";
import { type Site, sitesOf } from "../app/sites.ts";
import type { Member } from "../app/workspace.ts";
import type { User } from "../auth/session.ts";
import { localDate } from "../filters.ts";
import { type Order, toOrder } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";

const DOT: Record<string, string> = {
	open: "bg-status-open",
	assigned: "bg-status-active",
	in_progress: "bg-warning",
	done: "bg-status-done",
	cancelled: "bg-muted-foreground",
};

type Props = { db: LocalDb; user: User };

/** Every job on one map: the office sees where the work is, a technician their day. */
export function JobMap({ db, user }: Props) {
	const { t } = useTranslation();
	const manage = canManage(user.role);
	const [filters, setFilters] = useState<MapFilters>(
		manage
			? { status: "active", assignee: ALL, day: "" }
			: { status: "active", assignee: user.id, day: localDate() },
	);
	const [chosen, setChosen] = useState<string | null>(null);
	const rows = useLiveQuery(() => db.ofType(WORK_ORDER), [db]);
	const sites = useLiveQuery(() => sitesOf(db), [db]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	if (!rows || !sites) return null;

	const orders = rows.flatMap((r) => toOrder(r.id, r.state) ?? []);
	const siteById = new Map(sites.map((s) => [s.id, s]));
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const { pinned, unpinned } = jobsOnMap(orders, siteById, filters);
	const pick = pinned.find((p) => p.order.id === chosen) ?? null;
	const set = (patch: Partial<MapFilters>) =>
		setFilters((f) => ({ ...f, ...patch }));

	return (
		<div className="grid gap-6">
			<PageHeader
				title={t("jobsMap.title")}
				description={manage ? t("jobsMap.hint") : t("jobsMap.techHint")}
			/>
			<div
				className={cn(
					"grid gap-4 sm:grid-cols-2",
					manage && "lg:grid-cols-3 xl:max-w-4xl",
					!manage && "xl:max-w-2xl",
				)}
			>
				<SelectField
					id="map-status"
					label={t("orders.status")}
					placeholder={t("orders.activeWork")}
					value={filters.status}
					onChange={(status) => set({ status })}
					options={[
						{ value: "active", label: t("orders.activeWork") },
						{ value: ALL, label: t("orders.anyStatus") },
						...STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
					]}
				/>
				{manage && (
					<SelectField
						id="map-assignee"
						label={t("orders.technician")}
						placeholder={t("orders.anyone")}
						value={filters.assignee}
						onChange={(assignee) => set({ assignee })}
						options={[
							{ value: ALL, label: t("orders.anyone") },
							{ value: "none", label: t("orders.unassigned") },
							...(members ?? [])
								.filter((m) => m.role === "technician")
								.map((m) => ({ value: m.id, label: m.name })),
						]}
					/>
				)}
				<DateField
					id="map-day"
					label={t("jobsMap.day")}
					value={filters.day}
					onChange={(day) => set({ day })}
					clearLabel={t("orders.anyDate")}
				/>
			</div>

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
				<div className="relative">
					<JobsMap
						pins={pinned}
						chosen={chosen}
						onChoose={setChosen}
						label={t("jobsMap.label")}
						className="h-[60dvh] min-h-80 lg:h-[calc(100dvh-20rem)] lg:min-h-[28rem]"
					/>
					{pinned.length === 0 && (
						<p className="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] flex animate-in items-center justify-center gap-2 rounded-lg bg-background/90 px-3 py-2 text-sm font-medium shadow-sm duration-300 fade-in-0">
							<MapPinOff aria-hidden className="size-4 text-muted-foreground" />
							{t("jobsMap.noPins")}
						</p>
					)}
				</div>

				<aside className="grid gap-6 lg:max-h-[calc(100dvh-20rem)] lg:min-h-[28rem] lg:overflow-y-auto lg:pr-1">
					{pick ? (
						<Chosen
							key={pick.order.id}
							pin={pick}
							site={
								pick.order.siteId ? siteById.get(pick.order.siteId) : undefined
							}
							who={
								pick.order.assigneeId
									? names.get(pick.order.assigneeId)
									: undefined
							}
							onClose={() => setChosen(null)}
						/>
					) : (
						pinned.length > 0 && (
							<p className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-muted-foreground">
								<MapPin aria-hidden className="size-4 shrink-0" />
								{t("jobsMap.chooseHint")}
							</p>
						)
					)}

					{pinned.length > 0 && (
						<section aria-labelledby="on-map" className="grid gap-2">
							<h2 id="on-map" className="font-semibold">
								{t("jobsMap.pinned", { count: pinned.length })}
							</h2>
							<ul className="grid gap-1">
								{pinned.map(({ order }) => (
									<li key={order.id} className={ITEM_IN}>
										<button
											type="button"
											aria-pressed={order.id === chosen}
											onClick={() => setChosen(order.id)}
											className={cn(
												"flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted",
												order.id === chosen &&
													"bg-accent text-accent-foreground hover:bg-accent",
											)}
										>
											<span
												aria-hidden
												className={cn(
													"size-2.5 shrink-0 rounded-full",
													DOT[order.status] ?? DOT.open,
												)}
											/>
											<span className="min-w-0 flex-1 truncate">
												{order.title}
											</span>
											<StatusBadge status={order.status} size="sm" />
										</button>
									</li>
								))}
							</ul>
						</section>
					)}

					{unpinned.length > 0 && (
						<section aria-labelledby="no-pin" className="grid gap-2">
							<div className="grid gap-1">
								<h2 id="no-pin" className="font-semibold">
									{t("jobsMap.unpinned", { count: unpinned.length })}
								</h2>
								<p className="text-sm text-muted-foreground">
									{t("jobsMap.unpinnedHint")}
								</p>
							</div>
							<ul className="grid gap-1">
								{unpinned.map((order) => (
									<li key={order.id} className={ITEM_IN}>
										<Unpinned order={order} />
									</li>
								))}
							</ul>
						</section>
					)}
				</aside>
			</div>
		</div>
	);
}

function Unpinned({ order }: { order: Order }) {
	return (
		<a
			href={ROUTES.order(order.id)}
			className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-foreground transition-colors hover:bg-muted"
		>
			<MapPinOff
				aria-hidden
				className="size-4 shrink-0 text-muted-foreground"
			/>
			<span className="min-w-0 flex-1 truncate">{order.title}</span>
			<StatusBadge status={order.status} size="sm" />
		</a>
	);
}

/** The job behind the chosen pin, with the way there. */
function Chosen({
	pin: { order, location },
	site,
	who,
	onClose,
}: {
	pin: Pin;
	site: Site | undefined;
	who: string | undefined;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const address = order.address || site?.address;
	const box = useRef<HTMLElement>(null);
	// On a phone the card sits under the map, out of sight of the pin just tapped.
	useEffect(() => {
		box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, []);
	return (
		<section
			ref={box}
			aria-label={order.title}
			className="scroll-mb-28 md:scroll-mb-6 grid animate-in gap-3 rounded-xl border bg-card p-4 shadow-sm duration-300 fade-in-0 slide-in-from-bottom-2"
		>
			<div className="flex items-start gap-2">
				<h2 className="min-w-0 flex-1 text-lg font-semibold">{order.title}</h2>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={t("jobsMap.close")}
					className="-mt-1 -mr-1 text-muted-foreground"
					onPress={onClose}
				>
					<X aria-hidden />
				</Button>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<StatusBadge status={order.status} />
				{order.dueDate && (
					<span className="flex items-center gap-1.5 text-sm text-muted-foreground">
						<CalendarDays aria-hidden className="size-4" />
						{formatDay(order.dueDate)}
					</span>
				)}
			</div>
			{(site || address) && (
				<p className="flex gap-2">
					<MapPin
						aria-hidden
						className="mt-0.5 size-4 shrink-0 text-muted-foreground"
					/>
					<span>{[site?.name, address].filter(Boolean).join(" · ")}</span>
				</p>
			)}
			{who && <Person name={who} />}
			<div className="grid grid-cols-2 gap-2">
				<LinkButton href={ROUTES.order(order.id)} className="h-11">
					{t("jobsMap.open")}
				</LinkButton>
				<LinkButton
					href={directionsUrl(location)}
					target="_blank"
					rel="noreferrer"
					variant="outline"
					className="h-11"
				>
					<Navigation aria-hidden />
					{t("order.directions")}
				</LinkButton>
			</div>
		</section>
	);
}
