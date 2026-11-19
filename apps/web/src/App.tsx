import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRoute } from "./app/route.ts";
import { startSync } from "./app/workspace.ts";
import type { Session, User } from "./auth/session.ts";
import { Login } from "./screens/Login.tsx";
import { OrderDetail } from "./screens/OrderDetail.tsx";
import { Orders } from "./screens/Orders.tsx";
import { SyncBadge } from "./screens/SyncBadge.tsx";
import type { SyncLoop } from "./sync/loop.ts";
import type { LocalDb } from "./sync/storage.ts";

type Props = { db: LocalDb; session: Session };

export function App({ db, session }: Props) {
	const { user, revoked } = useSyncExternalStore(
		session.subscribe,
		session.snapshot,
	);
	if (revoked) return <Revoked session={session} />;
	if (!user) return <Login session={session} />;
	return <SignedIn key={user.id} db={db} session={session} user={user} />;
}

function SignedIn({ db, session, user }: Props & { user: User }) {
	const [loop, setLoop] = useState<SyncLoop | null>(null);
	const route = useRoute();
	const pending =
		useLiveQuery(
			() => db.outbox.where("status").anyOf("pending", "inflight").count(),
			[db],
		) ?? 0;

	useEffect(() => {
		let stop: (() => void) | undefined;
		let cancelled = false;
		void startSync(db, session).then((sync) => {
			if (cancelled) return sync.stop();
			stop = sync.stop;
			setLoop(sync.loop);
		});
		return () => {
			cancelled = true;
			stop?.();
		};
	}, [db, session]);

	return (
		<>
			<header className="topbar">
				<strong className="brand">FieldSync</strong>
				{loop && <SyncBadge loop={loop} pending={pending} />}
				<span className="who">
					{user.name} <span className="muted">· {user.role}</span>
				</span>
				<SignOut session={session} pending={pending} />
			</header>
			<main className="page">
				{route.name === "list" || !loop ? (
					<Orders db={db} user={user} />
				) : (
					<OrderDetail
						db={db}
						loop={loop}
						user={user}
						id={route.name === "order" ? route.id : null}
					/>
				)}
			</main>
		</>
	);
}

function SignOut({ session, pending }: { session: Session; pending: number }) {
	const [asking, setAsking] = useState(false);
	if (!asking) {
		return (
			<button
				type="button"
				className="link"
				onClick={() => (pending > 0 ? setAsking(true) : void session.signOut())}
			>
				Sign out
			</button>
		);
	}
	return (
		<span className="confirm">
			{pending} {pending === 1 ? "change is" : "changes are"} not synced and
			will be lost.
			<button
				type="button"
				className="danger"
				onClick={() => void session.signOut()}
			>
				Sign out anyway
			</button>
			<button type="button" className="link" onClick={() => setAsking(false)}>
				Cancel
			</button>
		</span>
	);
}

function Revoked({ session }: { session: Session }) {
	return (
		<main className="login">
			<div className="card">
				<h1>Device revoked</h1>
				<p className="muted">
					An admin locked this device out. Its copy of the work orders can no
					longer sync.
				</p>
				<button
					type="button"
					className="danger"
					onClick={() => void session.signOut()}
				>
					Erase this device's data
				</button>
			</div>
		</main>
	);
}
