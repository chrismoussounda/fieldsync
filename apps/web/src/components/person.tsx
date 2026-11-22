import { cn } from "cn";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");

/** A person's initials in a circle, with their name beside it. */
export function Person({
	name,
	detail,
	wrap = false,
	className,
}: {
	name: string;
	detail?: string;
	/** Lets a long name take two lines rather than being cut. */
	wrap?: boolean;
	className?: string;
}) {
	return (
		<span className={cn("flex min-w-0 items-center gap-3", className)}>
			<Avatar aria-hidden className="size-9">
				<AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
					{initials(name)}
				</AvatarFallback>
			</Avatar>
			<span className="grid min-w-0 leading-tight">
				<span className={wrap ? "break-words" : "truncate"}>{name}</span>
				{detail && (
					<span
						className={cn(
							"text-sm text-muted-foreground",
							wrap ? "break-words" : "truncate",
						)}
					>
						{detail}
					</span>
				)}
			</span>
		</span>
	);
}
