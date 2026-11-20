import { type FormEvent, useCallback, useEffect, useState } from "react";
import { MIN_PASSWORD, messageFor } from "../app/errors.ts";
import { apiFetch, type Member } from "../app/workspace.ts";
import type { Role, Session, User } from "../auth/session.ts";
import type { LocalDb } from "../sync/storage.ts";

const ROLES: readonly Role[] = ["technician", "dispatcher", "admin"];

const ROLE_LABELS: Record<Role, string> = {
	technician: "Technician",
	dispatcher: "Dispatcher",
	admin: "Admin",
};

type Props = { db: LocalDb; session: Session; user: User };

/** Who is in the org; admins add people, change roles and lock accounts. */
export function Team({ db, session, user }: Props) {
	const [members, setMembers] = useState<Member[] | null>(null);
	const [offline, setOffline] = useState(false);
	const [adding, setAdding] = useState(false);

	const load = useCallback(async () => {
		try {
			const result = await apiFetch<{ users: Member[] }>(session, "/users");
			const users = result?.users ?? [];
			setMembers(users);
			setOffline(false);
			// The order form's assignee list reads this cache.
			await db.setMeta("members", users);
		} catch {
			setOffline(true);
		}
	}, [db, session]);

	useEffect(() => {
		void load();
	}, [load]);

	// Active people first, then by name.
	const sorted = [...(members ?? [])].sort(
		(a, b) =>
			Number(!a.active) - Number(!b.active) || a.name.localeCompare(b.name),
	);

	return (
		<section>
			<div className="toolbar">
				<h2>Team</h2>
				{!adding && (
					<button type="button" onClick={() => setAdding(true)}>
						Add someone
					</button>
				)}
			</div>
			{adding && (
				<AddMember
					session={session}
					onDone={async (added) => {
						setAdding(false);
						if (added) await load();
					}}
				/>
			)}
			{offline && (
				<p className="muted empty">The team list needs the network.</p>
			)}
			<ul className="orders">
				{sorted.map((m) => (
					<MemberCard
						key={m.id}
						member={m}
						self={m.id === user.id}
						session={session}
						onChange={load}
					/>
				))}
			</ul>
		</section>
	);
}

function AddMember({
	session,
	onDone,
}: {
	session: Session;
	onDone: (added: boolean) => Promise<void>;
}) {
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setBusy(true);
		setError(null);
		try {
			await apiFetch(session, "/users", {
				method: "POST",
				json: {
					name: String(form.get("name")),
					email: String(form.get("email")),
					role: String(form.get("role")),
					password: String(form.get("password")),
				},
			});
			await onDone(true);
		} catch (e) {
			setError(messageFor(e));
			setBusy(false);
		}
	}

	return (
		<form className="card form add-member" onSubmit={submit}>
			<h3>Add someone</h3>
			<div className="row">
				<label>
					Name
					<input name="name" required maxLength={100} autoComplete="off" />
				</label>
				<label>
					Email
					<input name="email" type="email" required autoComplete="off" />
				</label>
			</div>
			<div className="row">
				<label>
					Role
					<select name="role" defaultValue="technician">
						{ROLES.map((r) => (
							<option key={r} value={r}>
								{ROLE_LABELS[r]}
							</option>
						))}
					</select>
				</label>
				<label>
					First password
					<input
						name="password"
						type="password"
						required
						minLength={MIN_PASSWORD}
						autoComplete="new-password"
					/>
				</label>
			</div>
			<p className="muted hint">
				At least {MIN_PASSWORD} characters. Give it to them in person; they can
				change it from their account.
			</p>
			{error && (
				<p role="alert" className="error">
					{error}
				</p>
			)}
			<div className="actions">
				<button type="submit" disabled={busy}>
					{busy ? "Adding…" : "Add"}
				</button>
				<button
					type="button"
					className="link"
					onClick={() => void onDone(false)}
				>
					Cancel
				</button>
			</div>
		</form>
	);
}

type Mode = "view" | "edit" | "password" | "disable";

function MemberCard({
	member,
	self,
	session,
	onChange,
}: {
	member: Member;
	self: boolean;
	session: Session;
	onChange: () => Promise<void>;
}) {
	const [mode, setMode] = useState<Mode>("view");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function run(method: "PATCH" | "POST", path: string, json?: unknown) {
		setBusy(true);
		setError(null);
		try {
			await apiFetch(session, `/users/${member.id}${path}`, { method, json });
			setMode("view");
			await onChange();
		} catch (e) {
			setError(messageFor(e));
		} finally {
			setBusy(false);
		}
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		if (mode === "edit") {
			const name = String(form.get("name")).trim();
			const role = form.get("role");
			void run("PATCH", "", {
				...(name !== member.name ? { name } : {}),
				...(role && role !== member.role ? { role } : {}),
			});
		} else if (mode === "password") {
			void run("POST", "/password", {
				password: String(form.get("password")),
			});
		}
	}

	const cancel = () => {
		setMode("view");
		setError(null);
	};

	return (
		<li className={`card order member${member.active ? "" : " inactive"}`}>
			<div className="order-head">
				<strong>{member.name}</strong>
				<span className="chips">
					{self && <span className="chip">You</span>}
					<span className="chip">{ROLE_LABELS[member.role]}</span>
					{!member.active && <span className="chip refused">Disabled</span>}
				</span>
			</div>
			{member.email && <p className="meta">{member.email}</p>}

			{(mode === "edit" || mode === "password") && (
				<form className="form" onSubmit={submit}>
					{mode === "edit" ? (
						<div className="row">
							<label>
								Name
								<input
									name="name"
									defaultValue={member.name}
									required
									maxLength={100}
								/>
							</label>
							<label>
								Role
								<select
									name="role"
									defaultValue={member.role}
									disabled={self}
									title={self ? "Another admin must change your role" : ""}
								>
									{ROLES.map((r) => (
										<option key={r} value={r}>
											{ROLE_LABELS[r]}
										</option>
									))}
								</select>
							</label>
						</div>
					) : (
						<label>
							New password for {member.name}
							<input
								name="password"
								type="password"
								required
								minLength={MIN_PASSWORD}
								autoComplete="new-password"
							/>
						</label>
					)}
					{error && (
						<p role="alert" className="error">
							{error}
						</p>
					)}
					<div className="actions">
						<button type="submit" disabled={busy}>
							Save
						</button>
						<button type="button" className="link" onClick={cancel}>
							Cancel
						</button>
					</div>
				</form>
			)}

			{mode === "disable" && (
				<div className="confirm">
					Lock {member.name} out on every device? Changes they have not synced
					yet will not reach the office.
					<button
						type="button"
						className="danger"
						disabled={busy}
						onClick={() => void run("POST", "/disable")}
					>
						Disable
					</button>
					<button type="button" className="link" onClick={cancel}>
						Cancel
					</button>
					{error && (
						<p role="alert" className="error">
							{error}
						</p>
					)}
				</div>
			)}

			{mode === "view" && (
				<div className="actions">
					{member.active && (
						<button
							type="button"
							className="link"
							onClick={() => setMode("edit")}
						>
							Edit
						</button>
					)}
					{member.active && !self && (
						<button
							type="button"
							className="link"
							onClick={() => setMode("password")}
						>
							Set password
						</button>
					)}
					{!self &&
						(member.active ? (
							<button
								type="button"
								className="link"
								onClick={() => setMode("disable")}
							>
								Disable
							</button>
						) : (
							<button
								type="button"
								className="link"
								disabled={busy}
								onClick={() => void run("POST", "/enable")}
							>
								Enable
							</button>
						))}
					{error && (
						<p role="alert" className="error">
							{error}
						</p>
					)}
				</div>
			)}
		</li>
	);
}
