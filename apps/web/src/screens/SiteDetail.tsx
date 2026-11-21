import { type EntityState, isDeleted } from "@fieldsync/merge";
import {
	canManage,
	MAX_SITE_LENGTH,
	SITE,
	SITE_FIELDS,
} from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { type FormEvent, useState } from "react";
import { ROUTES } from "../app/route.ts";
import { jobsAt, telLink } from "../app/sites.ts";
import type { Member } from "../app/workspace.ts";
import type { User } from "../auth/session.ts";
import { STATUS_LABELS } from "../orders.ts";
import type { SyncLoop } from "../sync/loop.ts";
import type { LocalDb } from "../sync/storage.ts";

type Props = { db: LocalDb; loop: SyncLoop; user: User };
type SiteField = (typeof SITE_FIELDS)[number];

/** A customer site and its jobs, or a new site when `id` is null. */
export function SiteDetail({ id, ...props }: Props & { id: string | null }) {
	const state = useLiveQuery(
		async () =>
			id ? ((await props.db.entities.get([SITE, id]))?.state ?? null) : null,
		[props.db, id],
	);
	if (state === undefined) return null;
	if (id && (!state || isDeleted(state))) {
		return (
			<section className="card">
				<p>This site no longer exists.</p>
				<a href={ROUTES.sites}>Back to the sites</a>
			</section>
		);
	}
	return (
		<div className="detail">
			<SiteForm key={id ?? "new"} id={id} state={state} {...props} />
			{id && <SiteJobs db={props.db} siteId={id} />}
		</div>
	);
}

const LABELS: Record<SiteField, string> = {
	name: "Name",
	address: "Address",
	contactName: "Contact",
	contactPhone: "Phone",
	accessNotes: "Access notes",
};

function SiteForm({
	loop,
	user,
	id,
	state,
}: Omit<Props, "db"> & { id: string | null; state: EntityState | null }) {
	const [edits, setEdits] = useState<Partial<Record<SiteField, string>>>({});
	const [error, setError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const editable = canManage(user.role);
	const live = (f: SiteField) => {
		const value = state?.fields[f];
		return typeof value === "string" ? value : "";
	};
	const value = (f: SiteField) => edits[f] ?? live(f);

	async function save(event: FormEvent) {
		event.preventDefault();
		if (!value("name").trim()) return setError("Give the site a name.");
		const patch: Record<string, string | null> = {};
		for (const f of SITE_FIELDS) {
			if (edits[f] === undefined || edits[f] === live(f)) continue;
			patch[f] = edits[f].trim() || null;
		}
		if (Object.keys(patch).length > 0) {
			await loop.mutate({
				entityType: SITE,
				entityId: id ?? crypto.randomUUID(),
				patch,
			});
		}
		window.location.hash = ROUTES.sites;
	}

	async function remove() {
		if (!id) return;
		await loop.mutate({ entityType: SITE, entityId: id, kind: "delete" });
		window.location.hash = ROUTES.sites;
	}

	const input = (f: SiteField) => ({
		value: value(f),
		disabled: !editable,
		maxLength: MAX_SITE_LENGTH[f],
		onChange: (e: { target: { value: string } }) =>
			setEdits((all) => ({ ...all, [f]: e.target.value })),
	});
	const phone = live("contactPhone");

	return (
		<form className="card form" onSubmit={save}>
			<div className="toolbar">
				<h2>{id ? live("name") : "New site"}</h2>
				<a href={ROUTES.sites}>Back</a>
			</div>
			<label>
				{LABELS.name}
				<input {...input("name")} required />
			</label>
			<label>
				{LABELS.address}
				<input {...input("address")} />
			</label>
			<div className="row">
				<label>
					{LABELS.contactName}
					<input {...input("contactName")} />
				</label>
				<label>
					{LABELS.contactPhone}
					<input type="tel" {...input("contactPhone")} />
				</label>
			</div>
			{phone && <a href={telLink(phone)}>Call {phone}</a>}
			<label>
				{LABELS.accessNotes}
				<textarea {...input("accessNotes")} rows={3} />
			</label>
			{error && (
				<p role="alert" className="error">
					{error}
				</p>
			)}
			{editable && (
				<div className="actions">
					<button type="submit">Save</button>
					{id && !confirmDelete && (
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
							Delete this site? Its orders keep their address.
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
			)}
		</form>
	);
}

function SiteJobs({ db, siteId }: { db: LocalDb; siteId: string }) {
	const jobs = useLiveQuery(() => jobsAt(db, siteId), [db, siteId]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	if (!jobs) return null;
	const names = new Map(members?.map((m) => [m.id, m.name]));
	return (
		<section className="card">
			<h3>Jobs at this site</h3>
			{jobs.length === 0 && <p className="muted">No jobs on this device.</p>}
			<ul className="orders">
				{jobs.map((o) => (
					<li key={o.id}>
						<a href={ROUTES.order(o.id)} className="order">
							<div className="order-head">
								<span>{o.title}</span>
								<span className={`chip status-${o.status}`}>
									{STATUS_LABELS[o.status] ?? o.status}
								</span>
							</div>
							<span className="meta">
								{o.dueDate && <span>Due {o.dueDate}</span>}
								{o.assigneeId && (
									<span>{names.get(o.assigneeId) ?? "Assigned"}</span>
								)}
							</span>
						</a>
					</li>
				))}
			</ul>
		</section>
	);
}
