import { cn } from "cn";
import { type ReactNode, useId } from "react";

/** A titled card; its title names it for screen readers and tests. */
export function Section({
	title,
	aside,
	action,
	className,
	children,
}: {
	title: string;
	/** Short text beside the title, e.g. a count. */
	aside?: ReactNode;
	/** A button at the top right. */
	action?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	const id = useId();
	return (
		<section
			aria-labelledby={id}
			className={cn(
				"grid gap-4 rounded-2xl border bg-card p-5 md:p-6",
				className,
			)}
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-baseline gap-3">
					<h2 id={id} className="text-lg font-semibold">
						{title}
					</h2>
					{aside && <span className="text-muted-foreground">{aside}</span>}
				</div>
				{action}
			</div>
			{children}
		</section>
	);
}
