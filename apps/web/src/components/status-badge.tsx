import { cn } from "cn";
import { useTranslation } from "react-i18next";

const TONE: Record<string, string> = {
	open: "bg-status-open/12 text-status-open",
	assigned: "bg-status-active/12 text-status-active",
	in_progress: "bg-warning/15 text-warning",
	done: "bg-status-done/12 text-status-done",
	cancelled: "bg-muted text-muted-foreground line-through",
};

const STATUSES = [
	"open",
	"assigned",
	"in_progress",
	"done",
	"cancelled",
] as const;

export function StatusBadge({
	status,
	size = "default",
}: {
	status: string;
	size?: "default" | "sm";
}) {
	const { t } = useTranslation();
	const known = STATUSES.find((s) => s === status);
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center rounded-full font-medium transition-colors duration-300",
				size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
				TONE[status] ?? TONE.open,
			)}
		>
			{known ? t(`status.${known}`) : status}
		</span>
	);
}
