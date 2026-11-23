import { useQueryClient } from "@tanstack/react-query";
import {
	CalendarRange,
	Copy,
	FileSignature,
	GitMerge,
	Smartphone,
	Sparkles,
	WifiOff,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { encode } from "uqr";
import { Confirm } from "@/components/confirm";
import { DemoPeople } from "@/components/demo-people";
import { DetailSheet } from "@/components/form-sheet";
import { Failure } from "@/components/try-demo";
import { Button } from "@/components/ui/button";
import { useApp } from "../app/context.ts";
import { messageFor } from "../app/errors.ts";
import { ROUTES } from "../app/route.ts";
import type { Demo, Person } from "../auth/session.ts";

const TRIES = [
	{ id: "offline", icon: WifiOff },
	{ id: "conflict", icon: GitMerge },
	{ id: "schedule", icon: CalendarRange },
	{ id: "sign", icon: FileSignature },
	{ id: "lock", icon: Smartphone },
] as const;

/** Opens what a visitor can do with their demo, from any page. */
export function DemoButton({ demo }: { demo: Demo }) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button
				variant="outline"
				className="h-10 rounded-full px-3.5 text-sm"
				onPress={() => setOpen(true)}
			>
				<Sparkles aria-hidden className="text-primary" />
				{t("demo.open")}
			</Button>
			<DemoSheet demo={demo} open={open} onOpenChange={setOpen} />
		</>
	);
}

function DemoSheet({
	demo,
	open,
	onOpenChange,
}: {
	demo: Demo;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t, i18n } = useTranslation();
	const { unsent, busy, error, ask, go, cancel } = useSwitch(demo);
	const ends = new Intl.DateTimeFormat(i18n.language, {
		weekday: "long",
		day: "numeric",
		month: "long",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(demo.expiresAt));
	return (
		<>
			<DetailSheet
				open={open}
				onOpenChange={onOpenChange}
				title={t("demo.title")}
				description={t("demo.hint", { time: ends })}
			>
				{demo.entry && (
					<>
						<section aria-labelledby="demo-people" className="grid gap-3">
							<Heading
								id="demo-people"
								title={t("demo.people")}
								hint={t("demo.peopleHint")}
							/>
							<DemoPeople
								current={demo.entry.person}
								busy={busy}
								onPick={(person) => void ask(person)}
							/>
							<Failure error={error} className="text-destructive" />
						</section>
						<section aria-labelledby="demo-device" className="grid gap-3">
							<Heading
								id="demo-device"
								title={t("demo.device")}
								hint={t("demo.deviceHint")}
							/>
							<Invite invite={demo.entry.key} />
						</section>
					</>
				)}
				<section aria-labelledby="demo-tries" className="grid gap-3">
					<Heading id="demo-tries" title={t("demo.tries")} />
					<ul className="grid gap-4">
						{TRIES.map(({ id, icon: Icon }) => (
							<li key={id} className="flex gap-3">
								<span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
									<Icon aria-hidden className="size-4" />
								</span>
								<span className="grid gap-0.5">
									<span className="font-medium">
										{t(`demo.try.${id}Title`)}
									</span>
									<span className="text-sm text-muted-foreground">
										{t(`demo.try.${id}`)}
									</span>
								</span>
							</li>
						))}
					</ul>
				</section>
			</DetailSheet>
			<Confirm
				open={unsent !== null}
				onOpenChange={(next) => !next && cancel()}
				title={t("demo.unsentTitle")}
				description={t("demo.unsent", { count: unsent?.count ?? 0 })}
				confirmLabel={t("demo.switchAnyway")}
				onConfirm={() => unsent && void go(unsent.person)}
			/>
		</>
	);
}

function Heading({
	id,
	title,
	hint,
}: {
	id: string;
	title: string;
	hint?: string;
}) {
	return (
		<div className="grid gap-1">
			<h2 id={id} className="font-semibold">
				{title}
			</h2>
			{hint && <p className="text-sm text-muted-foreground">{hint}</p>}
		</div>
	);
}

/** Becomes someone else on this device, after sending what is waiting. */
function useSwitch(demo: Demo) {
	const { db, session, sync } = useApp();
	const queries = useQueryClient();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [unsent, setUnsent] = useState<{
		person: Person;
		count: number;
	} | null>(null);

	async function ask(person: Person) {
		setBusy(true);
		setError(null);
		await sync.loop.run();
		await sync.photos.run();
		const count =
			(await db.outbox.where("status").anyOf("pending", "inflight").count()) +
			(await db.files.where("uploaded").equals(0).count());
		if (count === 0) return go(person);
		setBusy(false);
		setUnsent({ person, count });
	}

	async function go(person: Person) {
		if (!demo.entry) return;
		setUnsent(null);
		setBusy(true);
		// A sync under way would write this person's data over the next one's.
		await sync.loop.halt();
		try {
			await session.joinDemo(demo.entry.key, person);
			queries.clear();
			window.location.hash = ROUTES.list;
		} catch (e) {
			sync.loop.resume();
			setError(messageFor(e));
			setBusy(false);
		}
	}

	return { unsent, busy, error, ask, go, cancel: () => setUnsent(null) };
}

function Invite({ invite }: { invite: string }) {
	const { t } = useTranslation();
	const link = `${window.location.origin}/${ROUTES.demo(invite)}`;
	async function copy() {
		try {
			await navigator.clipboard.writeText(link);
			toast.success(t("demo.copied"));
		} catch {
			toast.error(t("demo.copyFailed"));
		}
	}
	return (
		<div className="flex flex-wrap items-center gap-4">
			<QrCode text={link} label={t("demo.qr")} />
			<Button variant="outline" className="h-11" onPress={() => void copy()}>
				<Copy aria-hidden />
				{t("demo.copy")}
			</Button>
		</div>
	);
}

function QrCode({ text, label }: { text: string; label: string }) {
	const { size, data } = encode(text, { border: 2 });
	const path = data
		.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : "")))
		.join("");
	return (
		// Always dark on white: some cameras cannot read the reverse.
		<svg
			role="img"
			aria-label={label}
			viewBox={`0 0 ${size} ${size}`}
			shapeRendering="crispEdges"
			className="size-40 rounded-xl border bg-white text-black"
		>
			<path d={path} fill="currentColor" />
		</svg>
	);
}
