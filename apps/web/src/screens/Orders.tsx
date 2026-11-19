import { canManage } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { ROUTES } from "../app/route.ts";
import type { Member } from "../app/workspace.ts";
import type { User } from "../auth/session.ts";
import { byUrgency, STATUS_LABELS, toOrder, WORK_ORDER } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";

export function Orders({ db, user }: { db: LocalDb; user: User }) {
	const [mineOnly, setMineOnly] = useState(user.role === "technician");
	const rows = useLiveQuery(() => db.entities.toArray(), [db]);
	const outbox = useLiveQuery(() => db.outbox.toArray(), [db]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);

	if (!rows) return null;
	const waiting = new Set(
		outbox?.filter((r) => r.status !== "dead").map((r) => r.entityId),
	);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const orders = rows
		.filter((r) => r.type === WORK_ORDER)
		.map((r) => toOrder(r.id, r.state))
		.filter((o) => o !== null)
		.filter((o) => !mineOnly || o.assigneeId === user.id)
		.sort(byUrgency);

	return (
		<section>
			<div className="toolbar">
				<h2>Work orders</h2>
				<div className="actions">
					<label className="toggle">
						<input
							type="checkbox"
							checked={mineOnly}
							onChange={(e) => setMineOnly(e.target.checked)}
						/>
						Mine only
					</label>
					{canManage(user.role) && <a href={ROUTES.new}>New work order</a>}
				</div>
			</div>
			{orders.length === 0 && (
				<p className="muted empty">
					{rows.length === 0 ? "Nothing synced yet." : "No work orders here."}
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
								{o.dueDate && <span>Due {o.dueDate}</span>}
								<span>
									{o.assigneeId
										? (names.get(o.assigneeId) ?? "Assigned")
										: "Unassigned"}
								</span>
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
