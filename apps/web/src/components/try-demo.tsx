import { cn } from "cn";
import { Building2, HardHat } from "lucide-react";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useSignIn } from "../app/use-sign-in.ts";
import type { Session } from "../auth/session.ts";

const ROLES = [
	{ role: "dispatcher", icon: Building2, label: "login.asOffice" },
	{ role: "technician", icon: HardHat, label: "login.asTechnician" },
] as const;

type Variant = ComponentProps<typeof Button>["variant"];

/** One button per demo account, no password needed. */
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
			<div className={cn("grid gap-2", className)}>
				{ROLES.map(({ role, icon: Icon, label }, i) => (
					<Button
						key={role}
						variant={variants[i]}
						isDisabled={busy}
						className={cn("h-11", buttonClassName)}
						onPress={() => void attempt(() => session.demo(role))}
					>
						<Icon aria-hidden />
						{t(label)}
					</Button>
				))}
			</div>
			{error && (
				<p role="alert" className={cn("text-sm", errorClassName)}>
					{error}
				</p>
			)}
		</div>
	);
}
