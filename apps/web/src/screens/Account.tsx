import { type FormEvent, useState } from "react";
import { MIN_PASSWORD, messageFor } from "../app/errors.ts";
import { apiFetch } from "../app/workspace.ts";
import type { Session, User } from "../auth/session.ts";

/** The signed-in user's own account. */
export function Account({ session, user }: { session: Session; user: User }) {
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);
	const [busy, setBusy] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const element = event.currentTarget;
		const form = new FormData(element);
		const next = String(form.get("next"));
		setDone(false);
		if (next !== form.get("repeat")) {
			return setError("The two new passwords are not the same.");
		}
		setBusy(true);
		setError(null);
		try {
			await apiFetch(session, "/me/password", {
				method: "POST",
				json: { current: String(form.get("current")), next },
			});
			element.reset();
			setDone(true);
		} catch (e) {
			setError(messageFor(e));
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="card form">
			<div className="toolbar">
				<h2>Your account</h2>
			</div>
			<p>
				{user.name} <span className="muted">· {user.role}</span>
			</p>
			<form className="form" onSubmit={submit}>
				<h3>Change password</h3>
				<label>
					Current password
					<input
						name="current"
						type="password"
						required
						autoComplete="current-password"
					/>
				</label>
				<div className="row">
					<label>
						New password
						<input
							name="next"
							type="password"
							required
							minLength={MIN_PASSWORD}
							autoComplete="new-password"
						/>
					</label>
					<label>
						Repeat it
						<input
							name="repeat"
							type="password"
							required
							autoComplete="new-password"
						/>
					</label>
				</div>
				<p className="muted hint">
					At least {MIN_PASSWORD} characters. Your other devices will ask you to
					sign in again.
				</p>
				{error && (
					<p role="alert" className="error">
						{error}
					</p>
				)}
				{done && <p role="status">Password changed.</p>}
				<div className="actions">
					<button type="submit" disabled={busy}>
						{busy ? "Saving…" : "Change password"}
					</button>
				</div>
			</form>
		</section>
	);
}
