import { decode } from "@fieldsync/hlc";
import { WORK_ORDER } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { useSyncExternalStore } from "react";
import type { Sync } from "../app/workspace.ts";
import type { LocalDb } from "../sync/storage.ts";

const time = (ms: number) => new Date(ms).toLocaleString();

const OUTBOX_LABELS = {
	pending: "waiting",
	inflight: "sending",
	dead: "refused",
};

/** What the sync engine is doing on this device, for demos and support. */
export function Debug({ db, sync }: { db: LocalDb; sync: Sync }) {
	const { client, loop, network, storage } = sync;
	const status = useSyncExternalStore(loop.subscribe, loop.status);
	const offline = useSyncExternalStore(network.subscribe, network.isOffline);
	const outbox = useLiveQuery(() => db.outbox.toArray(), [db]) ?? [];
	const cursor = useLiveQuery(() => db.getMeta<number>("cursor"), [db]) ?? 0;
	const deviceId = useLiveQuery(() => db.getMeta<string>("deviceId"), [db]);
	const titles = useLiveQuery(
		async () =>
			new Map(
				(await db.entities.toArray())
					.filter((r) => r.type === WORK_ORDER)
					.map((r) => [r.id, String(r.state.fields.title ?? "Untitled")]),
			),
		[db],
	);

	// Read on each render; the status subscription re-renders after every sync.
	const clock = decode(client.clockState());
	const offset = client.clockOffset();
	const dead = outbox.filter((r) => r.status === "dead");

	return (
		<section className="debug">
			<div className="toolbar">
				<h2>Sync details</h2>
				<a href="#/">Back</a>
			</div>

			<div className="card">
				<label className="toggle">
					<input
						type="checkbox"
						checked={offline}
						onChange={(e) => {
							network.setOffline(e.target.checked);
							void loop.run();
						}}
					/>
					Simulate no network
				</label>
				<p className="muted">
					Edits keep working and wait in the outbox until the network is back.
				</p>
				<div className="actions">
					<button type="button" onClick={() => void loop.run()}>
						Sync now
					</button>
					<span className="muted">
						{status.state}
						{status.lastSyncedAt &&
							` · last synced ${time(status.lastSyncedAt)}`}
					</span>
				</div>
			</div>

			<dl className="card facts">
				<dt>Device</dt>
				<dd>
					<code>{deviceId}</code>
				</dd>
				<dt>Clock</dt>
				<dd>
					{time(clock.wall)}, counter {clock.counter}, node{" "}
					<code>{clock.node}</code>
				</dd>
				<dt>Server time</dt>
				<dd>
					{Math.abs(offset) < 1000
						? "matches this device"
						: `${Math.round(Math.abs(offset) / 1000)} s ${offset > 0 ? "ahead of" : "behind"} this device`}
				</dd>
				<dt>Pulled up to</dt>
				<dd>change #{cursor}</dd>
			</dl>

			<div className="card">
				<h3>Outbox ({outbox.length})</h3>
				{outbox.length === 0 && <p className="muted">Nothing waiting.</p>}
				<ul className="outbox">
					{outbox.map((r) => (
						<li key={r.opId}>
							<span className={`chip outbox-${r.status}`}>
								{OUTBOX_LABELS[r.status]}
							</span>
							<span>
								{r.op.kind} <strong>{titles?.get(r.entityId) ?? "?"}</strong>
								{r.op.kind === "upsert" &&
									`: ${Object.keys(r.op.patch).join(", ")}`}
							</span>
							<span className="muted">{time(decode(r.op.hlc).wall)}</span>
							{r.reason && <span className="error">{r.reason}</span>}
						</li>
					))}
				</ul>
				{dead.length > 0 && (
					<button
						type="button"
						className="link"
						onClick={() => void storage.discardDead(dead.map((r) => r.opId))}
					>
						Clear {dead.length} refused{" "}
						{dead.length === 1 ? "change" : "changes"}
					</button>
				)}
			</div>
		</section>
	);
}
