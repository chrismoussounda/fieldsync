import {
	canAddPhoto,
	canChangePhoto,
	MAX_CAPTION,
	PHOTO,
} from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { type ChangeEvent, useEffect, useState } from "react";
import { addPhoto, type Photo, photosOf, shrink } from "../app/photos.ts";
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

/** The order's photos; taken offline, they upload once the network is back. */
export function OrderPhotos({ db, loop, user, orderId, order }: Props) {
	const photos = useLiveQuery(() => photosOf(db, orderId), [db, orderId]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const [caption, setCaption] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [open, setOpen] = useState<Photo | null>(null);

	async function take(event: ChangeEvent<HTMLInputElement>) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		if (!file) return;
		setBusy(true);
		setError(null);
		try {
			const image = await shrink(file);
			await addPhoto(db, loop, {
				orderId,
				user,
				image,
				caption: caption.trim() || null,
			});
			setCaption("");
		} catch {
			setError("This picture could not be read. Try another one.");
		} finally {
			setBusy(false);
			input.value = "";
		}
	}

	async function remove(photo: Photo) {
		await loop.mutate({
			entityType: PHOTO,
			entityId: photo.id,
			kind: "delete",
		});
		setOpen(null);
	}

	return (
		<section className="card photos">
			<h3>Photos</h3>
			{photos?.length === 0 && <p className="muted">No photos yet.</p>}
			<ul className="photo-grid">
				{photos?.map((p) => (
					<li key={p.id}>
						<button
							type="button"
							className="thumb"
							onClick={() => setOpen(p)}
							aria-label={p.caption ?? "Photo"}
						>
							<PhotoImage db={db} id={p.id} alt={p.caption ?? "Photo"} />
						</button>
						{p.caption && <p className="caption">{p.caption}</p>}
					</li>
				))}
			</ul>
			{canAddPhoto(user, order) && (
				<div className="add-photo">
					<input
						aria-label="Caption"
						placeholder="Caption (optional)"
						maxLength={MAX_CAPTION}
						value={caption}
						onChange={(e) => setCaption(e.target.value)}
					/>
					<label className={`button${busy ? " disabled" : ""}`}>
						{busy ? "Saving…" : "Add photo"}
						<input
							type="file"
							accept="image/*"
							capture="environment"
							hidden
							disabled={busy}
							onChange={(e) => void take(e)}
						/>
					</label>
				</div>
			)}
			{error && (
				<p role="alert" className="error">
					{error}
				</p>
			)}
			{open && (
				<div
					className="viewer"
					role="dialog"
					aria-label={open.caption ?? "Photo"}
				>
					<div className="viewer-body">
						<PhotoImage db={db} id={open.id} alt={open.caption ?? "Photo"} />
						<p>
							{open.caption && <strong>{open.caption}</strong>}{" "}
							<span className="muted">
								by {names.get(open.takenBy) ?? "someone"},{" "}
								{new Date(open.takenAt).toLocaleString()}
							</span>
						</p>
						<div className="actions">
							<button type="button" onClick={() => setOpen(null)}>
								Close
							</button>
							{canChangePhoto(user, order, open) && (
								<button
									type="button"
									className="danger"
									onClick={() => void remove(open)}
								>
									Delete photo
								</button>
							)}
						</div>
					</div>
				</div>
			)}
		</section>
	);
}

/** The image from this device, or why it is not here yet. */
function PhotoImage({ db, id, alt }: { db: LocalDb; id: string; alt: string }) {
	const file = useLiveQuery(() => db.files.get(id), [db, id]);
	const [url, setUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!file) return setUrl(null);
		const next = URL.createObjectURL(
			new Blob([file.bytes], { type: file.type }),
		);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [file]);

	if (!url) {
		return <span className="placeholder muted">Not on this device yet</span>;
	}
	return (
		<span className="photo">
			<img src={url} alt={alt} />
			{file?.uploaded === 0 && <span className="chip waiting">Not synced</span>}
		</span>
	);
}
