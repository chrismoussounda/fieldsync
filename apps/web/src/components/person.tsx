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
	className,
}: {
	name: string;
	detail?: string;
	className?: string;
}) {
	return (
		<span className={cn("flex min-w-0 items-center gap-2.5", className)}>
			<Avatar size="sm" className="size-7">
				<AvatarFallback className="bg-accent text-[0.7rem] font-semibold text-accent-foreground">
					{initials(name)}
				</AvatarFallback>
			</Avatar>
			<span className="grid min-w-0 leading-tight">
				<span className="truncate">{name}</span>
				{detail && (
					<span className="truncate text-xs text-muted-foreground">
						{detail}
					</span>
				)}
			</span>
		</span>
	);
}
