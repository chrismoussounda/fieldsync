import { canManage } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { ROUTES } from "../app/route.ts";
import { sitesOf } from "../app/sites.ts";
import type { User } from "../auth/session.ts";
import type { LocalDb } from "../sync/storage.ts";

export function Sites({ db, user }: { db: LocalDb; user: User }) {
	const sites = useLiveQuery(() => sitesOf(db), [db]);
	const [search, setSearch] = useState("");
	if (!sites) return null;
	const words = search.toLowerCase().split(/\s+/).filter(Boolean);
	const shown = sites.filter((s) => {
		const text = [s.name, s.address, s.contactName].join(" ").toLowerCase();
		return words.every((w) => text.includes(w));
	});

	return (
		<section>
			<div className="toolbar">
				<h2>Customer sites</h2>
				{canManage(user.role) && <a href={ROUTES.newSite}>New site</a>}
			</div>
			<input
				type="search"
				aria-label="Search sites"
				placeholder="Search name, address or contact"
				value={search}
				onChange={(e) => setSearch(e.target.value)}
			/>
			{shown.length === 0 && (
				<p className="muted empty">
					{sites.length === 0 ? "No sites yet." : "No site matches."}
				</p>
			)}
			<ul className="orders">
				{shown.map((s) => (
					<li key={s.id}>
						<a href={ROUTES.site(s.id)} className="card order">
							<strong>{s.name}</strong>
							{s.address && <p className="muted">{s.address}</p>}
							{s.contactName && <p className="meta">{s.contactName}</p>}
						</a>
					</li>
				))}
			</ul>
		</section>
	);
}
