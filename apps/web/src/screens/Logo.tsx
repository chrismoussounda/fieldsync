import { cn } from "cn";
import { RefreshCw } from "lucide-react";

/** `compact` keeps only the mark on the narrowest phones. */
export function Logo({ compact = false }: { compact?: boolean }) {
	return (
		<span className="flex items-center gap-2 text-lg font-bold tracking-tight">
			<span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
				<RefreshCw className="size-4" aria-hidden />
			</span>
			<span className={cn(compact && "max-[420px]:sr-only")}>FieldSync</span>
		</span>
	);
}
