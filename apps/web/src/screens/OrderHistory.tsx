import { decode } from "@fieldsync/hlc";
import type { Op } from "@fieldsync/protocol";
import { WORK_ORDER } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { apiFetch, type Member } from "../app/workspace.ts";
import type { Session } from "../auth/session.ts";
import { describeValue, FIELD_LABELS } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";

type Entry = {
	opId: string;
	kind: Op["kind"];
	changes: Op["patch"];
	at: number;
	receivedAt: string;
	by: string | null;
	device: string | null;
};

// Synced this long after it was made: worth saying it was done offline.
const LATE_MS = 5 * 60_000;

type Props = {
	db: LocalDb;
	session: Session;
	id: string;
	/** Changes when the record does, so the list is fetched again. */
	stamp: string;
};

/** Who changed the order and when: this device's unsynced edits, then the server's log. */
export function OrderHistory({ db, session, id, stamp }: Props) {
	const [entries, setEntries] = useState<Entry[] | null>(null);
	const [offline, setOffline] = useState(false);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const local = useLiveQuery(
		() =>
			db.outbox
				.where("[entityType+entityId]")
				.equals([WORK_ORDER, id])
				.reverse()
				.toArray(),
		[db, id],
	);
	const waiting = local?.filter((r) => r.status !== "dead").length ?? 0;

	// biome-ignore lint/correctness/useExhaustiveDependencies: stamp and waiting only trigger a refetch, once this device's changes synced or others' arrived.
	useEffect(() => {
		let current = true;
		void apiFetch<{ entries: Entry[] }>(session, `/history/${WORK_ORDER}/${id}`)
			.then((result) => {
				if (!current) return;
				setEntries(result?.entries ?? []);
				setOffline(false);
			})
			.catch(() => current && setOffline(true));
		return () => {
			current = false;
		};
	}, [session, id, stamp, waiting]);

	const changes = (kind: Op["kind"], patch: Op["patch"]) => {
		if (kind === "delete") return <p>Deleted the order</p>;
		if (kind === "restore") return <p>Restored the order</p>;
		const fields = Object.entries(patch);
		if (fields.length === 0) {
			return <p className="muted">Newer edits had already replaced these.</p>;
		}
		return (
			<ul className="changes">
				{fields.map(([field, value]) => (
					<li key={field}>
						<span className="muted">{FIELD_LABELS[field] ?? field}</span>{" "}
						{describeValue(field, value, names)}
					</li>
				))}
			</ul>
		);
	};

	const when = (at: number) => new Date(at).toLocaleString();

	return (
		<section className="card history">
			<h3>History</h3>
			<ol className="timeline">
				{local?.map((r) => (
					<li key={r.opId}>
						<p className="meta">
							<strong>You</strong>
							<span>{when(decode(r.op.hlc).wall)}</span>
							{r.status === "dead" ? (
								<span className="chip refused">Refused by the server</span>
							) : (
								<span className="chip waiting">Not synced yet</span>
							)}
						</p>
						{changes(r.op.kind, r.op.patch)}
					</li>
				))}
				{entries?.map((e) => (
					<li key={e.opId}>
						<p className="meta">
							<strong>{e.by ?? "Unknown device"}</strong>
							<span>{when(e.at)}</span>
							{e.device && <span>{e.device}</span>}
							{Date.parse(e.receivedAt) - e.at > LATE_MS && (
								<span>
									Made offline, synced {when(Date.parse(e.receivedAt))}
								</span>
							)}
						</p>
						{changes(e.kind, e.changes)}
					</li>
				))}
			</ol>
			{offline && (
				<p className="muted">Changes from other devices need the network.</p>
			)}
			{!offline && entries?.length === 0 && local?.length === 0 && (
				<p className="muted">No changes yet.</p>
			)}
		</section>
	);
}
