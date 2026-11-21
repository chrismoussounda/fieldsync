import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LANGUAGES, type Language, setLanguage, useLanguage } from "@/i18n";
import { setTheme, THEMES, type Theme, useTheme } from "@/lib/theme";
import { MIN_PASSWORD, messageFor } from "../app/errors.ts";
import { apiFetch } from "../app/workspace.ts";
import type { Session, User } from "../auth/session.ts";
import { SignOut } from "./SignOut.tsx";

type Props = { session: Session; user: User; pending: number };

/** The signed-in user's own account and this device's preferences. */
export function Account({ session, user, pending }: Props) {
	const { t } = useTranslation();
	return (
		<div className="grid gap-4">
			<section className="grid gap-1 rounded-2xl border bg-card p-5">
				<h2 className="text-lg font-semibold">{t("account.title")}</h2>
				<p>
					{user.name}{" "}
					<span className="text-muted-foreground">
						· {t(`roles.${user.role}`)}
					</span>
				</p>
			</section>
			<Preferences />
			<ChangePassword session={session} />
			<div className="grid md:hidden">
				<SignOut session={session} pending={pending} />
			</div>
		</div>
	);
}

function Preferences() {
	const { t } = useTranslation();
	const language = useLanguage();
	const theme = useTheme();
	return (
		<section className="grid gap-4 rounded-2xl border bg-card p-5">
			<h3 className="font-semibold">{t("preferences.title")}</h3>
			<Choice
				label={t("preferences.language")}
				value={language}
				options={LANGUAGES.map((l) => [l, t(`languages.${l}`)] as const)}
				onChange={(l: Language) => setLanguage(l)}
			/>
			<Choice
				label={t("preferences.theme")}
				value={theme}
				options={THEMES.map((th) => [th, t(`preferences.${th}`)] as const)}
				onChange={(th: Theme) => setTheme(th)}
			/>
		</section>
	);
}

function Choice<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: readonly (readonly [T, string])[];
	onChange: (value: T) => void;
}) {
	return (
		<div className="grid gap-2">
			<span className="text-sm font-medium">{label}</span>
			<ToggleGroup
				aria-label={label}
				selectionMode="single"
				disallowEmptySelection
				selectedKeys={[value]}
				onSelectionChange={(keys) => {
					const next = options.find(([key]) => keys.has(key));
					if (next) onChange(next[0]);
				}}
				variant="outline"
			>
				{options.map(([key, text]) => (
					<ToggleGroupItem
						key={key}
						id={key}
						className="h-10 px-4 data-selected:border-primary data-selected:bg-primary data-selected:text-primary-foreground"
					>
						{text}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
}

function ChangePassword({ session }: { session: Session }) {
	const { t } = useTranslation();
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);
	const [busy, setBusy] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const element = event.currentTarget;
		const form = new FormData(element);
		const next = String(form.get("next"));
		setDone(false);
		if (next !== form.get("repeat")) return setError(t("account.mismatch"));
		setBusy(true);
		setError(null);
		try {
			await apiFetch(session, "/me/password", {
				method: "POST",
				json: { current: String(form.get("current")), next },
			});
			element.reset();
			setDone(true);
		} catch (e) {
			setError(messageFor(e));
		} finally {
			setBusy(false);
		}
	}

	return (
		<form
			className="grid gap-4 rounded-2xl border bg-card p-5"
			onSubmit={submit}
		>
			<h3 className="font-semibold">{t("account.password")}</h3>
			<Field
				name="current"
				label={t("account.current")}
				autoComplete="current-password"
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					name="next"
					label={t("account.next")}
					autoComplete="new-password"
					minLength={MIN_PASSWORD}
				/>
				<Field
					name="repeat"
					label={t("account.repeat")}
					autoComplete="new-password"
				/>
			</div>
			<p className="text-sm text-muted-foreground">
				{t("account.hint", { min: MIN_PASSWORD })}
			</p>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
			{done && <p role="status">{t("account.changed")}</p>}
			<Button
				type="submit"
				isDisabled={busy}
				className="h-10 justify-self-start"
			>
				{busy ? t("account.saving") : t("account.submit")}
			</Button>
		</form>
	);
}

function Field({
	name,
	label,
	autoComplete,
	minLength,
}: {
	name: string;
	label: string;
	autoComplete: string;
	minLength?: number;
}) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={name}>{label}</Label>
			<Input
				id={name}
				name={name}
				type="password"
				required
				minLength={minLength}
				autoComplete={autoComplete}
				className="h-10"
			/>
		</div>
	);
}
