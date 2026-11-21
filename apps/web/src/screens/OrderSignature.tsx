import { canAddPhoto, MAX_SIGNER } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { type PointerEvent, useRef, useState } from "react";
import { addPhoto, photosOf } from "../app/photos.ts";
import type { Member } from "../app/workspace.ts";
import type { User } from "../auth/session.ts";
import type { SyncLoop } from "../sync/loop.ts";
import type { LocalDb } from "../sync/storage.ts";
import { PhotoImage } from "./OrderPhotos.tsx";

type Props = {
	db: LocalDb;
	loop: SyncLoop;
	user: User;
	orderId: string;
	order: Record<string, unknown>;
};

/** The customer signs on the screen when the job is done; saved like a photo. */
export function OrderSignature({ db, loop, user, orderId, order }: Props) {
	const signatures = useLiveQuery(
		async () => (await photosOf(db, orderId)).filter((p) => p.signer),
		[db, orderId],
	);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const [signing, setSigning] = useState(false);
	const allowed = canAddPhoto(user, order);

	if (!signatures) return null;
	if (signatures.length === 0 && !allowed) return null;
	const latest = signatures.at(-1);

	return (
		<section className="card signature">
			<h3>Customer signature</h3>
			{latest && (
				<figure>
					<PhotoImage
						db={db}
						id={latest.id}
						alt={`Signed by ${latest.signer}`}
					/>
					<figcaption className="muted">
						Signed by <strong>{latest.signer}</strong>,{" "}
						{new Date(latest.takenAt).toLocaleString()}, with{" "}
						{names.get(latest.takenBy) ?? "someone"}
					</figcaption>
				</figure>
			)}
			{allowed &&
				(signing || !latest ? (
					<SignaturePad
						onCancel={latest ? () => setSigning(false) : undefined}
						onSave={async (image, signer) => {
							await addPhoto(db, loop, { orderId, user, image, signer });
							setSigning(false);
						}}
					/>
				) : (
					<button
						type="button"
						className="link"
						onClick={() => setSigning(true)}
					>
						Sign again
					</button>
				))}
		</section>
	);
}

function SignaturePad({
	onSave,
	onCancel,
}: {
	onSave: (image: Blob, signer: string) => Promise<void>;
	onCancel: (() => void) | undefined;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const last = useRef<{ x: number; y: number } | null>(null);
	const [drawn, setDrawn] = useState(false);
	const [signer, setSigner] = useState("");
	const [busy, setBusy] = useState(false);

	// The canvas is drawn at a fixed size and scaled by CSS.
	const point = (e: PointerEvent<HTMLCanvasElement>) => {
		const box = e.currentTarget.getBoundingClientRect();
		return {
			x: ((e.clientX - box.left) * e.currentTarget.width) / box.width,
			y: ((e.clientY - box.top) * e.currentTarget.height) / box.height,
		};
	};

	function down(e: PointerEvent<HTMLCanvasElement>) {
		e.currentTarget.setPointerCapture(e.pointerId);
		last.current = point(e);
	}

	function move(e: PointerEvent<HTMLCanvasElement>) {
		const from = last.current;
		const ctx = e.currentTarget.getContext("2d");
		if (!from || !ctx) return;
		const to = point(e);
		ctx.lineWidth = 3;
		ctx.lineCap = "round";
		ctx.strokeStyle = "#1c2321";
		ctx.beginPath();
		ctx.moveTo(from.x, from.y);
		ctx.lineTo(to.x, to.y);
		ctx.stroke();
		last.current = to;
		setDrawn(true);
	}

	function clear() {
		const c = canvas.current;
		c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
		setDrawn(false);
	}

	async function save() {
		const c = canvas.current;
		if (!c) return;
		setBusy(true);
		const image = await new Promise<Blob | null>((done) =>
			c.toBlob(done, "image/png"),
		);
		if (image) await onSave(image, signer.trim());
		setBusy(false);
	}

	return (
		<div className="pad">
			<canvas
				ref={canvas}
				width={600}
				height={200}
				aria-label="Signature pad"
				onPointerDown={down}
				onPointerMove={move}
				onPointerUp={() => {
					last.current = null;
				}}
			/>
			<input
				aria-label="Customer name"
				placeholder="Customer name"
				maxLength={MAX_SIGNER}
				value={signer}
				onChange={(e) => setSigner(e.target.value)}
			/>
			<div className="actions">
				<button
					type="button"
					disabled={!drawn || !signer.trim() || busy}
					onClick={() => void save()}
				>
					Save signature
				</button>
				<button type="button" className="link" onClick={clear}>
					Clear
				</button>
				{onCancel && (
					<button type="button" className="link" onClick={onCancel}>
						Cancel
					</button>
				)}
			</div>
		</div>
	);
}
