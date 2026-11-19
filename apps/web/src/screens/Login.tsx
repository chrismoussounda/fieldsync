import { HttpError } from "@fieldsync/sync-client";
import { type FormEvent, useState } from "react";
import type { Session } from "../auth/session.ts";

const MESSAGES: Record<string, string> = {
	UNAUTHORIZED: "Wrong email or password.",
	DEVICE_REVOKED: "This device was revoked by an admin.",
	DEVICE_TAKEN:
		"Changes from another account are still waiting on this device.",
};

export function Login({ session }: { session: Session }) {
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setBusy(true);
		setError(null);
		try {
			await session.login(
				String(form.get("email")),
				String(form.get("password")),
			);
		} catch (e) {
			setError(
				e instanceof HttpError
					? (MESSAGES[e.code ?? ""] ?? "The server refused the sign-in.")
					: "No connection. Signing in needs the network once.",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<main className="login">
			<form onSubmit={submit} className="card">
				<h1>FieldSync</h1>
				<p className="muted">Work orders that keep working offline.</p>
				<label>
					Email
					<input name="email" type="email" autoComplete="username" required />
				</label>
				<label>
					Password
					<input
						name="password"
						type="password"
						autoComplete="current-password"
						required
					/>
				</label>
				{error && (
					<p role="alert" className="error">
						{error}
					</p>
				)}
				<button type="submit" disabled={busy}>
					{busy ? "Signing in…" : "Sign in"}
				</button>
			</form>
		</main>
	);
}
