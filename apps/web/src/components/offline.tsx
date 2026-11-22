import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/** A screen that reads the server, shown while it cannot. */
export function Offline({
	text,
	onRetry,
}: {
	text: string;
	onRetry: () => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="grid place-items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
			<WifiOff aria-hidden className="size-8 text-muted-foreground" />
			<p className="font-medium">{text}</p>
			<Button variant="outline" onPress={onRetry}>
				{t("common.retry")}
			</Button>
		</div>
	);
}
