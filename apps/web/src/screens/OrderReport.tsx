import { formatMinutes, minutesBetween } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { reportOf } from "../app/report.ts";
import { ROUTES } from "../app/route.ts";
import type { Member } from "../app/workspace.ts";
import { STATUS_LABELS } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";
import { PhotoImage } from "./OrderPhotos.tsx";

const day = (iso: string) =>
	new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
const time = (iso: string) =>
	new Date(iso).toLocaleTimeString(undefined, { timeStyle: "short" });

/** The service report for the customer, printed or saved as PDF from the browser. */
export function OrderReport({ db, id }: { db: LocalDb; id: string }) {
	const [now] = useState(Date.now);
	const report = useLiveQuery(() => reportOf(db, id, now), [db, id, now]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	if (report === undefined) return null;
	if (report === null) {
		return (
			<section className="card">
				<p>This work order no longer exists.</p>
				<a href={ROUTES.list}>Back to the list</a>
			</section>
		);
	}
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const { order, site, items, entries, minutes, photos, signature } = report;
	const technician = order.assigneeId ? names.get(order.assigneeId) : null;
	const lastStop = entries.flatMap((e) => e.endedAt ?? []).at(-1);

	return (
		<article className="report">
			<div className="toolbar no-print">
				<a href={ROUTES.order(id)}>Back to the order</a>
				<button type="button" onClick={() => window.print()}>
					Print or save as PDF
				</button>
			</div>
			<header className="report-head">
				<div>
					<p className="muted">Service report</p>
					<h1>{order.title}</h1>
				</div>
				<dl>
					<dt>Reference</dt>
					<dd>{id.slice(0, 8).toUpperCase()}</dd>
					<dt>Date</dt>
					<dd>{day(lastStop ?? new Date(now).toISOString())}</dd>
					<dt>Status</dt>
					<dd>{STATUS_LABELS[order.status] ?? order.status}</dd>
				</dl>
			</header>

			<section className="report-grid">
				<div>
					<h2>Customer</h2>
					{site && <p>{site.name}</p>}
					{order.address && <p>{order.address}</p>}
					{site?.contactName && <p>{site.contactName}</p>}
					{site?.contactPhone && <p>{site.contactPhone}</p>}
				</div>
				<div>
					<h2>Technician</h2>
					<p>{technician ?? "Not assigned"}</p>
				</div>
			</section>

			{order.description && (
				<section>
					<h2>Request</h2>
					<p className="prose">{order.description}</p>
				</section>
			)}
			<section>
				<h2>Work done</h2>
				<p className="prose">{order.notes || "No notes."}</p>
			</section>

			{items.length > 0 && (
				<section>
					<h2>Checklist</h2>
					<ul className="report-list">
						{items.map((i) => (
							<li key={i.id}>
								<span aria-hidden="true">{i.done ? "☑" : "☐"}</span> {i.label}
								{!i.done && <span className="muted"> (not done)</span>}
							</li>
						))}
					</ul>
				</section>
			)}

			{entries.length > 0 && (
				<section>
					<h2>Time on site</h2>
					<table className="report-table">
						<thead>
							<tr>
								<th>Date</th>
								<th>From</th>
								<th>To</th>
								<th>Technician</th>
								<th>Time</th>
							</tr>
						</thead>
						<tbody>
							{entries.map((e) => (
								<tr key={e.id}>
									<td>{day(e.startedAt)}</td>
									<td>{time(e.startedAt)}</td>
									<td>{e.endedAt ? time(e.endedAt) : "Running"}</td>
									<td>{names.get(e.technicianId) ?? "Someone"}</td>
									<td>
										{formatMinutes(minutesBetween(e.startedAt, e.endedAt, now))}
									</td>
								</tr>
							))}
						</tbody>
						<tfoot>
							<tr>
								<th colSpan={4}>Total</th>
								<th>{formatMinutes(minutes)}</th>
							</tr>
						</tfoot>
					</table>
				</section>
			)}

			{photos.length > 0 && (
				<section>
					<h2>Photos</h2>
					<div className="report-photos">
						{photos.map((p) => (
							<figure key={p.id}>
								<PhotoImage db={db} id={p.id} alt={p.caption ?? "Photo"} />
								{p.caption && <figcaption>{p.caption}</figcaption>}
							</figure>
						))}
					</div>
				</section>
			)}

			<section className="report-signature">
				<h2>Customer signature</h2>
				{signature ? (
					<figure>
						<PhotoImage db={db} id={signature.id} alt="Signature" />
						<figcaption>
							{signature.signer}, {day(signature.takenAt)}{" "}
							{time(signature.takenAt)}
						</figcaption>
					</figure>
				) : (
					<p className="muted">Not signed.</p>
				)}
			</section>
		</article>
	);
}
