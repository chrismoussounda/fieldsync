import {
	canManage,
	formatMinutes,
	minutesBetween,
	TIME_ENTRY,
	WORK_ORDER,
} from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { entriesOf } from "../app/timesheet.ts";
import type { Member } from "../app/workspace.ts";
import type { User } from "../auth/session.ts";
import type { SyncLoop } from "../sync/loop.ts";
import type { LocalDb } from "../sync/storage.ts";

type Props = {
	db: LocalDb;
	loop: SyncLoop;
	user: User;
	orderId: string;
	order: Record<string, unknown>;
};

/** The technician clocks in and out on site; works offline like any edit. */
export function OrderTime({ db, loop, user, orderId, order }: Props) {
	const entries = useLiveQuery(() => entriesOf(db, orderId), [db, orderId]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const [now, setNow] = useState(Date.now);
	const office = canManage(user.role);
	const assigned = order.assigneeId === user.id;
	const running = entries?.find(
		(e) => e.technicianId === user.id && e.endedAt === null,
	);

	useEffect(() => {
		if (!running) return;
		const timer = setInterval(() => setNow(Date.now()), 15_000);
		return () => clearInterval(timer);
	}, [running]);

	if (!entries) return null;
	if (entries.length === 0 && !assigned) return null;
	const total = entries.reduce(
		(sum, e) => sum + minutesBetween(e.startedAt, e.endedAt, now),
		0,
	);

	async function start() {
		setNow(Date.now());
		await loop.mutate({
			entityType: TIME_ENTRY,
			entityId: crypto.randomUUID(),
			patch: {
				orderId,
				technicianId: user.id,
				startedAt: new Date().toISOString(),
				endedAt: null,
			},
		});
		if (order.status === "assigned") {
			await loop.mutate({
				entityType: WORK_ORDER,
				entityId: orderId,
				patch: { status: "in_progress" },
			});
		}
	}

	async function stop(id: string) {
		setNow(Date.now());
		await loop.mutate({
			entityType: TIME_ENTRY,
			entityId: id,
			patch: { endedAt: new Date().toISOString() },
		});
	}

	const clock = (iso: string) =>
		new Date(iso).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});

	return (
		<section className="card time">
			<div className="toolbar">
				<h3>Time on site</h3>
				{entries.length > 0 && (
					<span className="muted">{formatMinutes(total)} in all</span>
				)}
			</div>
			{assigned &&
				(running ? (
					<div className="actions">
						<span className="chip waiting">
							On site since {clock(running.startedAt)}
						</span>
						<button type="button" onClick={() => void stop(running.id)}>
							Stop
						</button>
					</div>
				) : (
					<div className="actions">
						<button type="button" onClick={() => void start()}>
							Start
						</button>
					</div>
				))}
			<ul className="items">
				{entries.map((e) => (
					<li key={e.id}>
						<span>
							{names.get(e.technicianId) ?? "Someone"},{" "}
							{new Date(e.startedAt).toLocaleDateString()} {clock(e.startedAt)}–
							{e.endedAt ? clock(e.endedAt) : "now"}
						</span>
						<strong>
							{formatMinutes(minutesBetween(e.startedAt, e.endedAt, now))}
						</strong>
						{office && (
							<button
								type="button"
								className="link"
								aria-label={`Remove time from ${clock(e.startedAt)}`}
								onClick={() =>
									void loop.mutate({
										entityType: TIME_ENTRY,
										entityId: e.id,
										kind: "delete",
									})
								}
							>
								Remove
							</button>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
