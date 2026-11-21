import { LogOut } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { Session } from "../auth/session.ts";

/** Warns before signing out would drop changes not yet synced. */
export function SignOut({
	session,
	pending,
}: {
	session: Session;
	pending: number;
}) {
	const { t } = useTranslation();
	const [asking, setAsking] = useState(false);
	if (!asking) {
		return (
			<Button
				variant="ghost"
				className="justify-start gap-3 text-muted-foreground"
				onPress={() => (pending > 0 ? setAsking(true) : void session.signOut())}
			>
				<LogOut aria-hidden />
				{t("signOut.action")}
			</Button>
		);
	}
	return (
		<div className="grid gap-2 rounded-xl border border-destructive/40 p-3 text-sm">
			<p>{t("signOut.unsynced", { count: pending })}</p>
			<Button variant="destructive" onPress={() => void session.signOut()}>
				{t("signOut.anyway")}
			</Button>
			<Button variant="ghost" onPress={() => setAsking(false)}>
				{t("signOut.cancel")}
			</Button>
		</div>
	);
}
