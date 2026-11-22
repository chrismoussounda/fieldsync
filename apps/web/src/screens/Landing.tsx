import {
	ArrowRight,
	CheckCircle2,
	CloudOff,
	FileSignature,
	GitMerge,
	Languages,
	Moon,
	Package,
	Play,
	Sun,
	Timer,
	Users,
	WifiOff,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, LinkButton } from "@/components/ui/button";
import { LANGUAGES, setLanguage, useLanguage } from "@/i18n";
import { setTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo.tsx";

const LOGIN = "#/login";
const SOURCE = "https://github.com/chrismoussounda/fieldsync";

/** What FieldSync is, for anyone not signed in. */
export function Landing() {
	const { t } = useTranslation();
	const features = [
		{ icon: CloudOff, title: "offlineTitle", body: "offlineBody" },
		{ icon: GitMerge, title: "syncTitle", body: "syncBody" },
		{ icon: FileSignature, title: "reportTitle", body: "reportBody" },
		{ icon: Timer, title: "timeTitle", body: "timeBody" },
		{ icon: Users, title: "teamTitle", body: "teamBody" },
		{ icon: Languages, title: "languageTitle", body: "languageBody" },
	] as const;
	const steps = [
		["step1Title", "step1Body"],
		["step2Title", "step2Body"],
		["step3Title", "step3Body"],
	] as const;

	return (
		<div className="min-h-dvh bg-background">
			<header className="sticky top-0 z-10 border-b bg-background">
				<div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-8">
					<Logo />
					<div className="ml-auto flex items-center gap-1">
						<LanguageSwitch />
						<ThemeSwitch />
						<LinkButton href={LOGIN} className="ml-2">
							{t("landing.signIn")}
						</LinkButton>
					</div>
				</div>
			</header>

			<main>
				<section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:px-8 lg:grid-cols-[1.1fr_1fr] lg:py-24">
					<div className="grid gap-6">
						<span className="flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm font-medium text-muted-foreground">
							<WifiOff aria-hidden className="size-4 text-primary" />
							{t("landing.badge")}
						</span>
						<h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance md:text-5xl">
							{t("landing.title")}
						</h1>
						<p className="max-w-xl text-lg text-muted-foreground">
							{t("landing.subtitle")}
						</p>
						<div className="flex flex-wrap gap-3">
							<LinkButton href={LOGIN} size="lg" className="h-12 px-6">
								{t("landing.start")}
								<ArrowRight aria-hidden />
							</LinkButton>
							<Button
								variant="outline"
								size="lg"
								className="h-12 bg-card px-6"
								onPress={() =>
									document
										.getElementById("features")
										?.scrollIntoView({ behavior: "smooth" })
								}
							>
								{t("landing.how")}
							</Button>
						</div>
					</div>
					<Preview />
				</section>

				<section id="features" className="border-y bg-card/50">
					<div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-8 lg:py-24">
						<div className="grid max-w-2xl gap-3">
							<h2 className="text-3xl font-semibold tracking-tight">
								{t("landing.featuresTitle")}
							</h2>
							<p className="text-lg text-muted-foreground">
								{t("landing.featuresSubtitle")}
							</p>
						</div>
						<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{features.map(({ icon: Icon, title, body }) => (
								<li
									key={title}
									className="grid content-start gap-3 rounded-2xl border bg-card p-6"
								>
									<span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
										<Icon aria-hidden className="size-5" />
									</span>
									<h3 className="text-lg font-semibold">
										{t(`landing.${title}`)}
									</h3>
									<p className="text-muted-foreground">
										{t(`landing.${body}`)}
									</p>
								</li>
							))}
						</ul>
					</div>
				</section>

				<section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-8 lg:py-24">
					<h2 className="text-3xl font-semibold tracking-tight">
						{t("landing.stepsTitle")}
					</h2>
					<ol className="grid gap-6 md:grid-cols-3">
						{steps.map(([title, body], i) => (
							<li key={title} className="grid content-start gap-3">
								<span className="grid size-10 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
									{i + 1}
								</span>
								<h3 className="text-lg font-semibold">
									{t(`landing.${title}`)}
								</h3>
								<p className="text-muted-foreground">{t(`landing.${body}`)}</p>
							</li>
						))}
					</ol>
				</section>

				<section className="mx-auto max-w-6xl px-4 pb-16 md:px-8 lg:pb-24">
					<div className="grid gap-6 rounded-3xl bg-primary p-8 text-primary-foreground md:flex md:items-center md:justify-between md:p-12">
						<div className="grid gap-2">
							<h2 className="text-3xl font-semibold tracking-tight">
								{t("landing.ctaTitle")}
							</h2>
							<p className="text-lg opacity-90">{t("landing.ctaBody")}</p>
						</div>
						<LinkButton
							href={LOGIN}
							variant="secondary"
							size="lg"
							className="h-12 justify-self-start px-6"
						>
							{t("landing.signIn")}
							<ArrowRight aria-hidden />
						</LinkButton>
					</div>
				</section>
			</main>

			<footer className="border-t">
				<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-muted-foreground md:px-8">
					<p>{t("landing.footer")}</p>
					<a href={SOURCE} target="_blank" rel="noreferrer">
						{t("landing.source")}
					</a>
				</div>
			</footer>
		</div>
	);
}

/** A glance at the app on a phone, drawn with the app's own styles. */
function Preview() {
	const { t } = useTranslation();
	return (
		<div aria-hidden className="relative mx-auto w-full max-w-sm">
			<div className="absolute -inset-6 -z-0 rounded-[3rem] bg-accent/60 blur-2xl" />
			<div className="relative grid gap-4 rounded-[2.25rem] border-8 border-foreground/90 bg-background p-4 shadow-2xl">
				<div className="flex items-center justify-between">
					<Logo />
					<span className="flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning">
						<span className="size-2 rounded-full bg-warning" />
						{t("landing.previewOffline")}
					</span>
				</div>
				<div className="flex overflow-hidden rounded-2xl border bg-card">
					<span className="w-1.5 bg-warning" />
					<div className="grid gap-1 p-4">
						<span className="font-semibold">{t("landing.previewJob")}</span>
						<span className="text-sm text-muted-foreground">
							{t("landing.previewSite")}
						</span>
					</div>
				</div>
				<div className="grid gap-1 rounded-2xl bg-primary p-4 text-primary-foreground">
					<span className="flex items-center gap-2 text-xs opacity-90">
						<Play className="size-3" />
						{t("landing.previewClock")}
					</span>
					<span className="font-mono text-3xl font-semibold">1:24:07</span>
				</div>
				<div className="grid gap-2 rounded-2xl border bg-card p-4">
					<span className="text-sm font-medium">
						{t("landing.previewSteps")}
					</span>
					<div className="h-2 overflow-hidden rounded-full bg-muted">
						<div className="h-full w-2/3 rounded-full bg-status-done" />
					</div>
					{[true, true, false].map((done, i) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: a fixed drawing.
							key={i}
							className={cn(
								"flex items-center gap-2 text-sm",
								done && "text-muted-foreground line-through",
							)}
						>
							<CheckCircle2
								className={cn(
									"size-4",
									done ? "text-status-done" : "text-muted-foreground/40",
								)}
							/>
							<span className="h-2 flex-1 rounded-full bg-muted" />
						</span>
					))}
				</div>
				<div className="flex items-center gap-2 rounded-2xl border bg-card p-3 text-sm">
					<Package className="size-4 text-muted-foreground" />
					<span className="h-2 flex-1 rounded-full bg-muted" />
					<span className="font-medium">2 pcs</span>
				</div>
			</div>
		</div>
	);
}

function LanguageSwitch() {
	const { t } = useTranslation();
	const language = useLanguage();
	const next = LANGUAGES.find((l) => l !== language) ?? "fr";
	return (
		<Button
			variant="ghost"
			aria-label={t(`languages.${next}`)}
			onPress={() => setLanguage(next)}
			className="font-semibold uppercase"
		>
			{next}
		</Button>
	);
}

function ThemeSwitch() {
	const { t } = useTranslation();
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={t("landing.theme")}
			onPress={() =>
				setTheme(
					document.documentElement.classList.contains("dark")
						? "light"
						: "dark",
				)
			}
		>
			<Sun aria-hidden className="hidden dark:block" />
			<Moon aria-hidden className="dark:hidden" />
		</Button>
	);
}
