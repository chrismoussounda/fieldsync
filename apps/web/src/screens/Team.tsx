import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Confirm } from "@/components/confirm";
import { columnHelper, DataTable } from "@/components/data-table";
import { TextField } from "@/components/fields";
import { FormSheet } from "@/components/form-sheet";
import { Offline } from "@/components/offline";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/person";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePhone } from "@/lib/use-phone";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import { MIN_PASSWORD, messageFor } from "../app/errors.ts";
import { apiFetch, type Member } from "../app/workspace.ts";
import type { Role, Session, User } from "../auth/session.ts";
import type { LocalDb } from "../sync/storage.ts";

const ROLES: readonly Role[] = ["technician", "dispatcher", "admin"];

type Props = { db: LocalDb; session: Session; user: User };
type Open =
	| { kind: "add" }
	| { kind: "edit" | "password" | "disable"; member: Member };

/** Who is in the org; admins add people, change roles and lock accounts. */
export function Team({ db, session, user }: Props) {
	const { t } = useTranslation();
	const phone = usePhone();
	const client = useQueryClient();
	const sheet = useSheet<Open>();
	// Kept while a sheet slides out.
	const open = sheet.value;
	const members = useQuery({
		queryKey: ["users"],
		queryFn: async () => {
			const result = await apiFetch<{ users: Member[] }>(session, "/users");
			const users = result?.users ?? [];
			// The order form's assignee list reads this cache.
			await db.setMeta("members", users);
			return users;
		},
	});
	const refresh = () => client.invalidateQueries({ queryKey: ["users"] });

	async function enable(member: Member) {
		try {
			await apiFetch(session, `/users/${member.id}/enable`, { method: "POST" });
			toast.success(t("team.enabled"));
			await refresh();
		} catch (e) {
			toast.error(messageFor(e));
		}
	}

	async function disable(member: Member) {
		try {
			await apiFetch(session, `/users/${member.id}/disable`, {
				method: "POST",
			});
			toast.success(t("team.disabledToast"));
			await refresh();
		} catch (e) {
			toast.error(messageFor(e));
		}
	}

	const sorted = [...(members.data ?? [])].sort(
		(a, b) =>
			Number(!a.active) - Number(!b.active) || a.name.localeCompare(b.name),
	);
	const actions = (member: Member) => (
		<MemberActions
			member={member}
			self={member.id === user.id}
			onPick={(kind) =>
				kind === "enable" ? void enable(member) : sheet.show({ kind, member })
			}
		/>
	);
	const helper = columnHelper<Member>();
	const columns = helper.columns([
		helper.accessor("name", {
			header: t("team.person"),
			cell: ({ row }) => (
				<Person
					name={row.original.name}
					detail={row.original.email ?? undefined}
				/>
			),
		}),
		helper.accessor("role", {
			header: t("team.role"),
			cell: ({ row }) => (
				<span className="flex items-center gap-2">
					{t(`roles.${row.original.role}`)}
					{row.original.id === user.id && (
						<span className="rounded-full bg-muted px-2 py-0.5 text-xs">
							{t("team.you")}
						</span>
					)}
				</span>
			),
		}),
		helper.accessor("active", {
			header: t("team.state"),
			cell: ({ row }) => <ActiveBadge active={row.original.active} />,
		}),
		helper.display({
			id: "actions",
			header: () => <span className="sr-only">{t("common.actions")}</span>,
			cell: ({ row }) => actions(row.original),
			meta: { className: "w-14 text-right" },
		}),
	]);

	return (
		<div className="grid grid-cols-1 gap-8">
			<PageHeader
				title={t("team.title")}
				description={
					members.data && t("team.count", { count: members.data.length })
				}
				actions={
					<Button
						className="h-10 px-4"
						onPress={() => sheet.show({ kind: "add" })}
					>
						<Plus aria-hidden />
						{t("team.add")}
					</Button>
				}
			/>
			{members.isError ? (
				<Offline
					text={t("team.offline")}
					onRetry={() => void members.refetch()}
				/>
			) : phone ? (
				<ul className="grid gap-2">
					{sorted.map((m) => (
						<li
							key={m.id}
							className={cn(
								"flex items-center justify-between gap-3 rounded-2xl border bg-card p-6",
								!m.active && "text-muted-foreground",
							)}
						>
							<div className="grid min-w-0 gap-2">
								<Person name={m.name} detail={m.email ?? undefined} />
								<span className="flex flex-wrap items-center gap-2 text-sm">
									{t(`roles.${m.role}`)}
									<ActiveBadge active={m.active} />
								</span>
							</div>
							{actions(m)}
						</li>
					))}
				</ul>
			) : (
				<DataTable
					label={t("team.title")}
					data={sorted}
					columns={columns}
					getRowId={(m) => m.id}
					muted={(m) => !m.active}
					empty={t("team.empty")}
				/>
			)}
			{open?.kind === "add" && (
				<AddSheet
					key={sheet.key}
					open={sheet.open}
					onClose={sheet.hide}
					session={session}
					onDone={refresh}
				/>
			)}
			{open?.kind === "edit" && (
				<EditSheet
					key={sheet.key}
					open={sheet.open}
					member={open.member}
					self={open.member.id === user.id}
					onClose={sheet.hide}
					session={session}
					onDone={refresh}
				/>
			)}
			{open?.kind === "password" && (
				<PasswordSheet
					key={sheet.key}
					open={sheet.open}
					member={open.member}
					onClose={sheet.hide}
					session={session}
				/>
			)}
			<Confirm
				open={sheet.open && open?.kind === "disable"}
				onOpenChange={(next) => !next && sheet.hide()}
				title={t("team.disableTitle", {
					name: open?.kind === "disable" ? open.member.name : "",
				})}
				description={t("team.disableBody")}
				confirmLabel={t("team.disable")}
				onConfirm={() => open?.kind === "disable" && void disable(open.member)}
			/>
		</div>
	);
}

function ActiveBadge({ active }: { active: boolean }) {
	const { t } = useTranslation();
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
				active
					? "bg-status-done/12 text-status-done"
					: "bg-destructive/10 text-destructive",
			)}
		>
			<span
				aria-hidden
				className={cn(
					"size-1.5 rounded-full",
					active ? "bg-status-done" : "bg-destructive",
				)}
			/>
			{active ? t("team.active") : t("team.disabled")}
		</span>
	);
}

type Pick = "edit" | "password" | "disable" | "enable";

function MemberActions({
	member,
	self,
	onPick,
}: {
	member: Member;
	self: boolean;
	onPick: (kind: Pick) => void;
}) {
	const { t } = useTranslation();
	const items: Pick[] = member.active
		? ["edit", ...(self ? [] : (["password", "disable"] as const))]
		: self
			? []
			: ["enable"];
	if (items.length === 0) return null;
	return (
		<DropdownMenuTrigger>
			<Button
				variant="ghost"
				size="icon"
				aria-label={t("team.actions", { name: member.name })}
			>
				<MoreHorizontal aria-hidden />
			</Button>
			<DropdownMenu placement="bottom end" className="min-w-48">
				{items.map((kind) => (
					<DropdownMenuItem
						key={kind}
						id={kind}
						variant={kind === "disable" ? "destructive" : "default"}
						onAction={() => onPick(kind)}
					>
						{kind === "password" ? t("team.setPassword") : t(`team.${kind}`)}
					</DropdownMenuItem>
				))}
			</DropdownMenu>
		</DropdownMenuTrigger>
	);
}

function useSubmit(run: () => Promise<void>) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	return {
		busy,
		error,
		submit: async () => {
			setBusy(true);
			setError(null);
			try {
				await run();
			} catch (e) {
				setError(messageFor(e));
			} finally {
				setBusy(false);
			}
		},
	};
}

function ServerError({ error }: { error: string | null }) {
	if (!error) return null;
	return (
		<p
			role="alert"
			className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
		>
			{error}
		</p>
	);
}

function AddSheet({
	open,
	onClose,
	session,
	onDone,
}: {
	open: boolean;
	onClose: () => void;
	session: Session;
	onDone: () => Promise<void>;
}) {
	const { t } = useTranslation();
	const [values, setValues] = useState({
		name: "",
		email: "",
		role: "technician" as Role,
		password: "",
	});
	const set = (change: Partial<typeof values>) =>
		setValues((v) => ({ ...v, ...change }));
	const { busy, error, submit } = useSubmit(async () => {
		await apiFetch(session, "/users", { method: "POST", json: values });
		toast.success(t("team.added", { name: values.name }));
		onClose();
		await onDone();
	});
	return (
		<FormSheet
			open={open}
			onOpenChange={(next) => !next && onClose()}
			title={t("team.form.addTitle")}
			submitLabel={t("team.form.submitAdd")}
			busy={busy}
			onSubmit={() => void submit()}
		>
			<TextField
				id="member-name"
				label={t("team.form.name")}
				placeholder={t("team.form.namePlaceholder")}
				required
				maxLength={100}
				value={values.name}
				onChange={(name) => set({ name })}
			/>
			<TextField
				id="member-email"
				type="email"
				label={t("team.form.email")}
				placeholder={t("team.form.emailPlaceholder")}
				required
				autoComplete="off"
				value={values.email}
				onChange={(email) => set({ email })}
			/>
			<RoleField value={values.role} onChange={(role) => set({ role })} />
			<TextField
				id="member-password"
				type="password"
				label={t("team.form.password")}
				placeholder={t("team.form.passwordPlaceholder", { min: MIN_PASSWORD })}
				hint={t("team.form.passwordHint")}
				required
				autoComplete="new-password"
				value={values.password}
				onChange={(password) => set({ password })}
			/>
			<ServerError error={error} />
		</FormSheet>
	);
}

function RoleField({
	value,
	onChange,
	isDisabled,
	hint,
}: {
	value: Role;
	onChange: (role: Role) => void;
	isDisabled?: boolean;
	hint?: string;
}) {
	const { t } = useTranslation();
	return (
		<SelectField
			id="member-role"
			label={t("team.form.role")}
			placeholder={t("team.form.rolePlaceholder")}
			options={ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
			value={value}
			onChange={(next) => {
				const role = ROLES.find((r) => r === next);
				if (role) onChange(role);
			}}
			isDisabled={isDisabled}
			hint={hint}
		/>
	);
}

function EditSheet({
	open,
	member,
	self,
	onClose,
	session,
	onDone,
}: {
	open: boolean;
	member: Member;
	self: boolean;
	onClose: () => void;
	session: Session;
	onDone: () => Promise<void>;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState(member.name);
	const [role, setRole] = useState<Role>(member.role);
	const { busy, error, submit } = useSubmit(async () => {
		const trimmed = name.trim();
		await apiFetch(session, `/users/${member.id}`, {
			method: "PATCH",
			json: {
				...(trimmed !== member.name ? { name: trimmed } : {}),
				...(role !== member.role ? { role } : {}),
			},
		});
		toast.success(t("team.saved"));
		onClose();
		await onDone();
	});
	return (
		<FormSheet
			open={open}
			onOpenChange={(next) => !next && onClose()}
			title={t("team.form.editTitle", { name: member.name })}
			submitLabel={t("common.save")}
			busy={busy}
			onSubmit={() => void submit()}
		>
			<TextField
				id="member-name"
				label={t("team.form.name")}
				placeholder={t("team.form.namePlaceholder")}
				required
				maxLength={100}
				value={name}
				onChange={setName}
			/>
			<RoleField
				value={role}
				onChange={setRole}
				isDisabled={self}
				hint={self ? t("team.ownRole") : undefined}
			/>
			<ServerError error={error} />
		</FormSheet>
	);
}

function PasswordSheet({
	open,
	member,
	onClose,
	session,
}: {
	open: boolean;
	member: Member;
	onClose: () => void;
	session: Session;
}) {
	const { t } = useTranslation();
	const [password, setPassword] = useState("");
	const { busy, error, submit } = useSubmit(async () => {
		await apiFetch(session, `/users/${member.id}/password`, {
			method: "POST",
			json: { password },
		});
		toast.success(t("team.passwordSet"));
		onClose();
	});
	return (
		<FormSheet
			open={open}
			onOpenChange={(next) => !next && onClose()}
			title={t("team.form.passwordTitle", { name: member.name })}
			submitLabel={t("common.save")}
			busy={busy}
			onSubmit={() => void submit()}
		>
			<TextField
				id="member-new-password"
				type="password"
				label={t("team.form.newPassword")}
				placeholder={t("team.form.passwordPlaceholder", { min: MIN_PASSWORD })}
				hint={t("team.form.passwordHint")}
				required
				autoComplete="new-password"
				value={password}
				onChange={setPassword}
			/>
			<ServerError error={error} />
		</FormSheet>
	);
}
