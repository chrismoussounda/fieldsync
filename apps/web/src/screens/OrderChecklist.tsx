import {
	CHECKLIST_ITEM,
	canManage,
	MAX_ITEM_LABEL,
} from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { type FormEvent, useEffect, useState } from "react";
import { type Item, itemsOf } from "../app/checklists.ts";
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

/** Steps the office sets for the job; the technician ticks them, offline too. */
export function OrderChecklist({ db, loop, user, orderId, order }: Props) {
	const items = useLiveQuery(() => itemsOf(db, orderId), [db, orderId]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const [label, setLabel] = useState("");
	// The tick shows at once, until the stored value catches up; after that,
	// changes from other devices show again.
	const [ticked, setTicked] = useState<Record<string, boolean>>({});
	useEffect(() => {
		setTicked((t) => {
			const stored = new Map(items?.map((i) => [i.id, i.done]));
			const left = Object.entries(t).filter(([id, v]) => stored.get(id) !== v);
			return left.length === Object.keys(t).length
				? t
				: Object.fromEntries(left);
		});
	}, [items]);
	const office = canManage(user.role);
	const canTick = office || order.assigneeId === user.id;

	if (!items) return null;
	if (items.length === 0 && !office) return null;
	const done = items.filter((i) => i.done).length;

	const write = (
		id: string,
		patch: Record<string, string | number | boolean | null>,
	) => loop.mutate({ entityType: CHECKLIST_ITEM, entityId: id, patch });

	function tick(item: Item, checked: boolean) {
		setTicked((t) => ({ ...t, [item.id]: checked }));
		void write(item.id, {
			done: checked,
			doneBy: checked ? user.id : null,
			doneAt: checked ? new Date().toISOString() : null,
		});
	}

	function add(event: FormEvent) {
		event.preventDefault();
		const text = label.trim();
		if (!text) return;
		const last = items?.at(-1)?.position ?? 0;
		void write(crypto.randomUUID(), {
			orderId,
			label: text,
			position: last + 1,
		});
		setLabel("");
	}

	return (
		<section className="card checklist">
			<div className="toolbar">
				<h3>Checklist</h3>
				{items.length > 0 && (
					<span className="muted">
						{done} of {items.length} done
					</span>
				)}
			</div>
			<ul className="items">
				{items.map((item) => (
					<li key={item.id}>
						<label className="toggle">
							<input
								type="checkbox"
								checked={ticked[item.id] ?? item.done}
								disabled={!canTick}
								onChange={(e) => tick(item, e.target.checked)}
							/>
							<span className={item.done ? "done" : ""}>{item.label}</span>
						</label>
						{item.done && item.doneBy && (
							<span className="muted meta">
								{names.get(item.doneBy) ?? "Someone"}
							</span>
						)}
						{office && (
							<button
								type="button"
								className="link"
								aria-label={`Remove ${item.label}`}
								onClick={() =>
									void loop.mutate({
										entityType: CHECKLIST_ITEM,
										entityId: item.id,
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
			{office && (
				<form className="add-item" onSubmit={add}>
					<input
						aria-label="New step"
						placeholder="New step, like “Close the main valve”"
						maxLength={MAX_ITEM_LABEL}
						value={label}
						onChange={(e) => setLabel(e.target.value)}
					/>
					<button type="submit">Add step</button>
				</form>
			)}
		</section>
	);
}
