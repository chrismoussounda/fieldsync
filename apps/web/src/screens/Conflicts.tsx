import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "../app/route.ts";
import { apiFetch, type Member } from "../app/workspace.ts";
import type { Session } from "../auth/session.ts";
import { FIELD_LABELS, STATUS_LABELS } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";

type Side = { value: unknown; at: number; by: string | null };

type Conflict = {
	id: string;
	entityId: string;
	title: string | null;
	field: string;
	reason: "concurrent_edit" | "edit_on_deleted";
	winner: Side;
	loser: Side;
	reviewedAt: string | null;
	reviewedBy: string | null;
};

const REASONS = {
	concurrent_edit: "Changed on two devices at the same time",
	edit_on_deleted: "Changed after the order was deleted",
};

/** Edits the sync engine had to choose between, for the office to check. */
export function Conflicts({ db, session }: { db: LocalDb; session: Session }) {
	const [showReviewed, setShowReviewed] = useState(false);
	const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
	const [offline, setOffline] = useState(false);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const names = new Map(members?.map((m) => [m.id, m.name]));

	const load = useCallback(async () => {
		try {
			const result = await apiFetch<{ conflicts: Conflict[] }>(
				session,
				`/conflicts?open=${!showReviewed}`,
			);
			setConflicts(result?.conflicts ?? []);
			setOffline(false);
		} catch {
			setOffline(true);
		}
	}, [session, showReviewed]);

	useEffect(() => {
		void load();
	}, [load]);

	async function review(id: string) {
		await apiFetch(session, `/conflicts/${id}/review`, { method: "POST" });
		await load();
	}

	const show = (field: string, value: unknown) => {
		if (value === null || value === undefined || value === "") return "(empty)";
		if (field === "assigneeId") return names.get(String(value)) ?? "Someone";
		if (field === "status")
			return STATUS_LABELS[String(value)] ?? String(value);
		return String(value);
	};
	const side = (label: string, field: string, s: Side) => (
		<p>
			<span className="muted">{label}</span>{" "}
			<strong>{show(field, s.value)}</strong>
			<span className="muted">
				{" "}
				by {s.by ?? "an unknown device"}, {new Date(s.at).toLocaleString()}
			</span>
		</p>
	);

	return (
		<section>
			<div className="toolbar">
				<h2>Conflicts</h2>
				<label className="toggle">
					<input
						type="checkbox"
						checked={showReviewed}
						onChange={(e) => setShowReviewed(e.target.checked)}
					/>
					Show reviewed
				</label>
			</div>
			{offline && (
				<p className="muted empty">The conflict log needs the network.</p>
			)}
			{!offline && conflicts?.length === 0 && (
				<p className="muted empty">No conflicts to review.</p>
			)}
			<ul className="orders">
				{conflicts?.map((c) => (
					<li key={c.id} className="card order">
						<div className="order-head">
							<a href={ROUTES.order(c.entityId)}>
								{c.title ?? "Deleted order"}
							</a>
							<span className="chip">{FIELD_LABELS[c.field] ?? c.field}</span>
						</div>
						<p className="muted">{REASONS[c.reason]}</p>
						{side("Kept", c.field, c.winner)}
						{side("Overwritten", c.field, c.loser)}
						{c.reviewedAt ? (
							<p className="muted">
								Reviewed by {c.reviewedBy},{" "}
								{new Date(c.reviewedAt).toLocaleString()}
							</p>
						) : (
							<div className="actions">
								<button type="button" onClick={() => void review(c.id)}>
									Mark reviewed
								</button>
							</div>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
