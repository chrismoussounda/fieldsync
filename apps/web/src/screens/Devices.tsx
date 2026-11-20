import { useCallback, useEffect, useState } from "react";
import { ago } from "../app/time.ts";
import { apiFetch } from "../app/workspace.ts";
import type { Session } from "../auth/session.ts";

type Device = {
	id: string;
	name: string;
	user: { id: string; name: string };
	registeredAt: string;
	lastSeenAt: string | null;
	revokedAt: string | null;
};

/** Every device signed in to the org, so an admin can lock out a lost one. */
export function Devices({ session }: { session: Session }) {
	const [devices, setDevices] = useState<Device[] | null>(null);
	const [offline, setOffline] = useState(false);
	const [mine, setMine] = useState<string | null>(null);
	const [confirming, setConfirming] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			const result = await apiFetch<{ devices: Device[] }>(session, "/devices");
			setDevices(result?.devices ?? []);
			setOffline(false);
		} catch {
			setOffline(true);
		}
	}, [session]);

	useEffect(() => {
		void load();
		void session.deviceId().then(setMine);
	}, [load, session]);

	async function revoke(id: string) {
		await apiFetch(session, `/devices/${id}/revoke`, { method: "POST" });
		setConfirming(null);
		await load();
	}

	// Active devices first, most recently seen on top.
	const sorted = [...(devices ?? [])].sort(
		(a, b) =>
			Number(a.revokedAt !== null) - Number(b.revokedAt !== null) ||
			(b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""),
	);

	return (
		<section>
			<div className="toolbar">
				<h2>Devices</h2>
			</div>
			{offline && (
				<p className="muted empty">The device list needs the network.</p>
			)}
			<ul className="orders">
				{sorted.map((d) => (
					<li key={d.id} className="card order">
						<div className="order-head">
							<strong>{d.name}</strong>
							{d.id === mine && <span className="chip">This device</span>}
							{d.revokedAt && <span className="chip refused">Revoked</span>}
						</div>
						<p className="meta">
							<span>{d.user.name}</span>
							<span>
								{d.lastSeenAt ? `Seen ${ago(d.lastSeenAt)}` : "Never synced"}
							</span>
							<span>Added {new Date(d.registeredAt).toLocaleDateString()}</span>
						</p>
						{!d.revokedAt && d.id !== mine && (
							<div className="actions">
								{confirming === d.id ? (
									<span className="confirm">
										Lock {d.user.name} out on this device?
										<button
											type="button"
											className="danger"
											onClick={() => void revoke(d.id)}
										>
											Revoke
										</button>
										<button
											type="button"
											className="link"
											onClick={() => setConfirming(null)}
										>
											Cancel
										</button>
									</span>
								) : (
									<button
										type="button"
										className="link"
										onClick={() => setConfirming(d.id)}
									>
										Revoke
									</button>
								)}
							</div>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
