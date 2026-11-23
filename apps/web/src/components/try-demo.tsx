import { cn } from "cn";
import { Building2, HardHat } from "lucide-react";
import { type ComponentProps, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { DemoPeople } from "@/components/demo-people";
import { Button } from "@/components/ui/button";
import { useSignIn } from "../app/use-sign-in.ts";
import type { Session } from "../auth/session.ts";

const SIDES = [
	{ person: "dispatch", icon: Building2, label: "login.asOffice" },
	{ person: "junior", icon: HardHat, label: "login.asTechnician" },
] as const;

type Variant = ComponentProps<typeof Button>["variant"];

/** Starts the visitor's own demo from either side, no password needed. */
export function TryDemo({
	session,
	variants = ["outline", "outline"],
	className,
	buttonClassName,
	errorClassName = "text-destructive",
}: {
	session: Session;
	variants?: [Variant, Variant];
	className?: string;
	buttonClassName?: string;
	errorClassName?: string;
}) {
	const { t } = useTranslation();
	const { error, busy, attempt } = useSignIn();
	return (
		<div className="grid gap-3">
			<DemoEnded session={session} />
			<div className={cn("grid gap-2", className)}>
				{SIDES.map(({ person, icon: Icon, label }, i) => (
					<Button
						key={person}
						variant={variants[i]}
						isDisabled={busy}
						className={cn("h-11", buttonClassName)}
						onPress={() => void attempt(() => session.startDemo(person))}
					>
						<Icon aria-hidden />
						{t(label)}
					</Button>
				))}
			</div>
			<Failure error={error} className={errorClassName} />
		</div>
	);
}

/** Starts the visitor's own demo as any of its people. */
export function StartDemo({ session }: { session: Session }) {
	const { error, busy, attempt } = useSignIn();
	return (
		<div className="grid gap-3">
			<DemoEnded session={session} />
			<DemoPeople
				busy={busy}
				onPick={(person) => void attempt(() => session.startDemo(person))}
			/>
			<Failure error={error} className="text-destructive" />
		</div>
	);
}

function DemoEnded({ session }: { session: Session }) {
	const { t } = useTranslation();
	const { demoEnded } = useSyncExternalStore(
		session.subscribe,
		session.snapshot,
	);
	if (!demoEnded) return null;
	return <p role="status">{t("demo.ended")}</p>;
}

export function Failure({
	error,
	className,
}: {
	error: string | null;
	className?: string;
}) {
	if (!error) return null;
	return (
		<p role="alert" className={cn("text-sm", className)}>
			{error}
		</p>
	);
}
