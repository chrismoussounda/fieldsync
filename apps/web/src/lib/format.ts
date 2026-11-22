import i18n from "i18next";

/** A `yyyy-mm-dd` day in the user's language, e.g. "21 nov. 2026". */
export function formatDay(day: string): string {
	const [y, m, d] = day.split("-").map(Number);
	if (!y || !m || !d) return day;
	return new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
		new Date(y, m - 1, d),
	);
}
