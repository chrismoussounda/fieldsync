import { type EntityState, isDeleted } from "@fieldsync/merge";
import {
	canManage,
	editableFields,
	FIELDS,
	type Field,
	PRIORITIES,
	STATUSES,
	WORK_ORDER,
} from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { type FormEvent, useState } from "react";
import { ROUTES } from "../app/route.ts";
import type { Member } from "../app/workspace.ts";
import type { User } from "../auth/session.ts";
import { type Draft, patchOf, STATUS_LABELS, toDraft } from "../orders.ts";
import type { SyncLoop } from "../sync/loop.ts";
import type { LocalDb } from "../sync/storage.ts";

type Props = { db: LocalDb; loop: SyncLoop; user: User };

const PRIORITY_LABELS: Record<string, string> = {
	urgent: "Urgent",
	normal: "Normal",
	low: "Low",
};

/** An existing work order, or a new one when `id` is null. */
export function OrderDetail({ id, ...props }: Props & { id: string | null }) {
	const state = useLiveQuery(
		async () =>
			id
				? ((await props.db.entities.get([WORK_ORDER, id]))?.state ?? null)
				: null,
		[props.db, id],
	);
	if (state === undefined) return null;
	if (id && (!state || isDeleted(state))) {
		return (
			<section className="card">
				<p>This work order no longer exists.</p>
				<a href={ROUTES.list}>Back to the list</a>
			</section>
		);
	}
	return <OrderForm key={id ?? "new"} id={id} state={state} {...props} />;
}

function OrderForm({
	db,
	loop,
	user,
	id,
	state,
}: Props & { id: string | null; state: EntityState | null }) {
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	// Only what the user typed; every other field shows the live value, so
	// changes synced while the form is open appear in it.
	const [edits, setEdits] = useState<Partial<Draft>>(() =>
		id ? {} : { priority: "normal" },
	);
	const [error, setError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const live = toDraft(state);
	const draft: Draft = { ...live, ...edits };
	const editable: ReadonlySet<Field> = id
		? editableFields(user, state?.fields ?? null)
		: new Set(canManage(user.role) ? FIELDS : []);
	const set = (field: Field) => (value: string) =>
		setEdits((e) => ({ ...e, [field]: value }));

	async function save(event: FormEvent) {
		event.preventDefault();
		if (!draft.title.trim()) return setError("Give the work order a title.");
		const patch = patchOf(live, draft, editable);
		if (!id && !draft.status) {
			patch.status = draft.assigneeId ? "assigned" : "open";
		}
		if (Object.keys(patch).length > 0) {
			await loop.mutate({
				entityType: WORK_ORDER,
				entityId: id ?? crypto.randomUUID(),
				patch,
			});
		}
		window.location.hash = ROUTES.list;
	}

	async function remove() {
		if (!id) return;
		await loop.mutate({ entityType: WORK_ORDER, entityId: id, kind: "delete" });
		window.location.hash = ROUTES.list;
	}

	const technicians = members?.filter((m) => m.role === "technician") ?? [];
	const field = (name: Field) => ({
		value: draft[name],
		disabled: !editable.has(name),
		onChange: (e: { target: { value: string } }) => set(name)(e.target.value),
	});

	return (
		<form className="card form" onSubmit={save}>
			<div className="toolbar">
				<h2>{id ? "Work order" : "New work order"}</h2>
				<a href={ROUTES.list}>Back</a>
			</div>
			{editable.size === 0 && (
				<p className="muted">
					Only the assigned technician or the office can change this order.
				</p>
			)}
			<label>
				Title
				<input {...field("title")} required />
			</label>
			<label>
				Description
				<textarea {...field("description")} rows={3} />
			</label>
			<label>
				Address
				<input {...field("address")} />
			</label>
			<div className="row">
				<label>
					Priority
					<select {...field("priority")}>
						{PRIORITIES.map((p) => (
							<option key={p} value={p}>
								{PRIORITY_LABELS[p]}
							</option>
						))}
					</select>
				</label>
				<label>
					Due
					<input type="date" {...field("dueDate")} />
				</label>
			</div>
			<label>
				Assigned to
				<select {...field("assigneeId")}>
					<option value="">Unassigned</option>
					{technicians.map((m) => (
						<option key={m.id} value={m.id}>
							{m.name}
						</option>
					))}
				</select>
			</label>
			{id && (
				<label>
					Status
					<select {...field("status")}>
						{STATUSES.map((s) => (
							<option key={s} value={s}>
								{STATUS_LABELS[s]}
							</option>
						))}
					</select>
				</label>
			)}
			<label>
				Notes
				<textarea {...field("notes")} rows={4} />
			</label>
			{error && (
				<p role="alert" className="error">
					{error}
				</p>
			)}
			<div className="actions">
				{editable.size > 0 && <button type="submit">Save</button>}
				{id && canManage(user.role) && !confirmDelete && (
					<button
						type="button"
						className="link"
						onClick={() => setConfirmDelete(true)}
					>
						Delete
					</button>
				)}
				{confirmDelete && (
					<span className="confirm">
						Delete this work order?
						<button type="button" className="danger" onClick={remove}>
							Delete
						</button>
						<button
							type="button"
							className="link"
							onClick={() => setConfirmDelete(false)}
						>
							Cancel
						</button>
					</span>
				)}
			</div>
		</form>
	);
}
