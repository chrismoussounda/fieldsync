import { useLiveQuery } from "dexie-react-hooks";
import { ROUTES } from "../app/route.ts";
import type { Member } from "../app/workspace.ts";
import {
	type Filters,
	isFinished,
	isOverdue,
	localDate,
	toQuery,
} from "../filters.ts";
import { type Order, STATUS_LABELS, toOrder, WORK_ORDER } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";

const link = (f: Partial<Filters>) => ROUTES.filtered(toQuery(f));

/** Where the work stands, from this device's copy, so it works offline too. */
export function Overview({ db }: { db: LocalDb }) {
	const rows = useLiveQuery(() => db.entities.toArray(), [db]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	if (!rows) return null;

	const today = localDate();
	const active = rows
		.filter((r) => r.type === WORK_ORDER)
		.map((r) => toOrder(r.id, r.state))
		.filter((o): o is Order => o !== null && !isFinished(o));
	const count = (test: (o: Order) => boolean) => active.filter(test).length;

	// `alert`: anything here needs the office's attention.
	const tiles = [
		{
			label: "Unassigned",
			value: count((o) => o.assigneeId === null),
			href: link({ assignee: "none" }),
			alert: true,
		},
		{
			label: "Overdue",
			value: count((o) => isOverdue(o, today)),
			href: link({ assignee: "all", due: "overdue" }),
			alert: true,
		},
		{
			label: "Due today",
			value: count((o) => o.dueDate === today),
			href: link({ assignee: "all", due: "today" }),
			alert: false,
		},
		{
			label: "Urgent",
			value: count((o) => o.priority === "urgent"),
			href: link({ assignee: "all", urgentOnly: true }),
			alert: true,
		},
	];

	// Disabled technicians only show while they still hold work.
	const technicians = (members ?? []).filter(
		(m) =>
			m.role === "technician" &&
			(m.active || active.some((o) => o.assigneeId === m.id)),
	);
	const load = technicians
		.map((m) => {
			const theirs = active.filter((o) => o.assigneeId === m.id);
			return {
				member: m,
				total: theirs.length,
				started: theirs.filter((o) => o.status === "in_progress").length,
				late: theirs.filter((o) => isOverdue(o, today)).length,
				urgent: theirs.filter((o) => o.priority === "urgent").length,
			};
		})
		.sort((a, b) => b.late - a.late || b.total - a.total);

	return (
		<section className="overview">
			<div className="toolbar">
				<h2>Overview</h2>
				<a href={link({ assignee: "all" })}>All active work</a>
			</div>

			<div className="stats">
				{tiles.map((t) => (
					<a
						key={t.label}
						href={t.href}
						className={`card stat${t.alert && t.value > 0 ? " alert" : ""}`}
					>
						<span className="stat-value">{t.value}</span>
						<span className="muted">{t.label}</span>
					</a>
				))}
			</div>

			<div className="card">
				<h3>By status</h3>
				<p className="meta">
					{(["open", "assigned", "in_progress"] as const).map((s) => (
						<a key={s} href={link({ assignee: "all", status: s })}>
							{STATUS_LABELS[s]}: {count((o) => o.status === s)}
						</a>
					))}
				</p>
			</div>

			<div className="card">
				<h3>Technicians</h3>
				{load.length === 0 ? (
					<p className="muted">No technicians yet.</p>
				) : (
					<table className="workload">
						<thead>
							<tr>
								<th scope="col">Technician</th>
								<th scope="col">Active</th>
								<th scope="col">Started</th>
								<th scope="col">Overdue</th>
								<th scope="col">Urgent</th>
							</tr>
						</thead>
						<tbody>
							{load.map((l) => (
								<tr key={l.member.id}>
									<th scope="row">
										<a href={link({ assignee: l.member.id })}>
											{l.member.name}
										</a>
										{!l.member.active && (
											<span className="chip refused">Disabled</span>
										)}
									</th>
									<td>{l.total}</td>
									<td>{l.started}</td>
									<td className={l.late > 0 ? "late" : ""}>{l.late}</td>
									<td>{l.urgent}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</section>
	);
}
