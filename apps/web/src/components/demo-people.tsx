import { cn } from "cn";
import { useTranslation } from "react-i18next";
import { initials } from "@/components/person";
import type { Person, Role } from "../auth/session.ts";

/** As the API creates them in every demo. */
const PEOPLE: { person: Person; name: string; role: Role }[] = [
	{ person: "dispatch", name: "Grâce Mabiala", role: "dispatcher" },
	{ person: "junior", name: "Junior Nkounkou", role: "technician" },
	{ person: "merveille", name: "Merveille Bouanga", role: "technician" },
	{ person: "admin", name: "Ange Moukala", role: "admin" },
];

/** The four people of the demo, to become one of them. */
export function DemoPeople({
	onPick,
	busy,
	current,
}: {
	onPick: (person: Person) => void;
	busy: boolean;
	current?: Person;
}) {
	const { t } = useTranslation();
	return (
		<ul className="grid gap-2">
			{PEOPLE.map(({ person, name, role }) => {
				const you = person === current;
				return (
					<li key={person}>
						<button
							type="button"
							disabled={busy || you}
							aria-current={you ? "true" : undefined}
							onClick={() => onPick(person)}
							className={cn(
								"flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
								you
									? "border-primary bg-accent text-accent-foreground"
									: "cursor-pointer hover:bg-muted disabled:cursor-default disabled:opacity-60",
							)}
						>
							<span
								aria-hidden
								className={cn(
									"grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-accent-foreground",
									you ? "bg-background" : "bg-accent",
								)}
							>
								{initials(name)}
							</span>
							<span className="grid min-w-0 flex-1 leading-tight">
								<span className="flex flex-wrap gap-x-2">
									<span className="font-medium">{name}</span>{" "}
									<span className="text-muted-foreground">
										{t(`roles.${role}`)}
									</span>
								</span>
								<span className="text-sm text-muted-foreground">
									{t(`demo.person.${person}`)}
								</span>
							</span>
							{you && (
								<span className="shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-sm font-medium text-primary-foreground">
									{t("demo.you")}
								</span>
							)}
						</button>
					</li>
				);
			})}
		</ul>
	);
}
