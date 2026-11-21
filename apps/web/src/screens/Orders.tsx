import { canManage, STATUSES } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
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
import { byUrgency, STATUS_LABELS, toOrder, WORK_ORDER } from "../orders.ts";
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

type Props = { db: LocalDb; user: User; query: string | null };

export function Orders({ db, user, query }: Props) {
	const [filters, setFilters] = useState(() => initial(user, query));
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
	const orders = all.filter((o) => matches(o, filters, ctx)).sort(byUrgency);
	const technicians =
		members?.filter((m) => m.role === "technician" && m.active) ?? [];
	const changed = JSON.stringify(filters) !== JSON.stringify(defaults(user));

	return (
		<section>
			<div className="toolbar">
				<h2>Work orders</h2>
				{canManage(user.role) && <a href={ROUTES.new}>New work order</a>}
			</div>
			<div className="filters">
				<input
					type="search"
					aria-label="Search"
					placeholder="Search title, address, notes or people"
					value={filters.text}
					onChange={(e) => set({ text: e.target.value })}
				/>
				<select
					aria-label="Status"
					value={filters.status}
					onChange={(e) => set({ status: e.target.value })}
				>
					<option value="active">Active work</option>
					<option value="all">Any status</option>
					{STATUSES.map((s) => (
						<option key={s} value={s}>
							{STATUS_LABELS[s]}
						</option>
					))}
				</select>
				<select
					aria-label="Assigned to"
					value={filters.assignee}
					onChange={(e) => set({ assignee: e.target.value })}
				>
					<option value="all">Anyone</option>
					<option value="me">Me</option>
					<option value="none">Unassigned</option>
					{technicians
						.filter((m) => m.id !== user.id)
						.map((m) => (
							<option key={m.id} value={m.id}>
								{m.name}
							</option>
						))}
				</select>
				<select
					aria-label="Due"
					value={filters.due}
					onChange={(e) => set({ due: e.target.value as Filters["due"] })}
				>
					<option value="any">Any date</option>
					<option value="overdue">Overdue</option>
					<option value="today">Due today</option>
					<option value="week">Next 7 days</option>
				</select>
				<label className="toggle">
					<input
						type="checkbox"
						checked={filters.urgentOnly}
						onChange={(e) => set({ urgentOnly: e.target.checked })}
					/>
					Urgent only
				</label>
			</div>
			<p className="muted count">
				{orders.length} of {all.length} work orders
				{changed && (
					<button
						type="button"
						className="link"
						onClick={() => set(defaults(user))}
					>
						Clear filters
					</button>
				)}
			</p>
			{orders.length === 0 && (
				<p className="muted empty">
					{rows.length === 0
						? "Nothing synced yet."
						: "No work orders match these filters."}
				</p>
			)}
			<ul className="orders">
				{orders.map((o) => (
					<li key={o.id}>
						<a href={ROUTES.order(o.id)} className="card order">
							<div className="order-head">
								<strong>{o.title}</strong>
								<span className={`chip status-${o.status}`}>
									{STATUS_LABELS[o.status] ?? o.status}
								</span>
							</div>
							{o.address && <p className="muted">{o.address}</p>}
							<p className="meta">
								{o.priority === "urgent" && (
									<span className="chip urgent">Urgent</span>
								)}
								{isOverdue(o, today) && (
									<span className="chip urgent">Overdue</span>
								)}
								{o.dueDate && <span>Due {o.dueDate}</span>}
								<span>
									{o.assigneeId
										? (names.get(o.assigneeId) ?? "Assigned")
										: "Unassigned"}
								</span>
								{checklists?.has(o.id) && (
									<span>
										Checklist {checklists.get(o.id)?.done}/
										{checklists.get(o.id)?.total}
									</span>
								)}
								{waiting.has(o.id) && (
									<span className="chip waiting">Not synced</span>
								)}
							</p>
						</a>
					</li>
				))}
			</ul>
		</section>
	);
}
