import type { fr } from "./fr.ts";

type Messages<T> = {
	[K in keyof T]: T[K] extends string ? string : Messages<T[K]>;
};

export const en: Messages<typeof fr> = {
	common: {
		cancel: "Cancel",
		save: "Save",
		edit: "Edit",
		delete: "Delete",
		back: "Back",
		search: "Search",
	},
	app: {
		tagline: "Work orders that keep working offline.",
	},
	nav: {
		main: "Main navigation",
		jobs: "Work orders",
		overview: "Overview",
		sites: "Sites",
		conflicts: "Conflicts",
		team: "Team",
		devices: "Devices",
		account: "Account",
		admin: "Administration",
	},
	roles: {
		technician: "Technician",
		dispatcher: "Dispatcher",
		admin: "Admin",
	},
	sync: {
		idle: "Synced",
		syncing: "Syncing…",
		offline: "Offline",
		error: "Sync failed",
		waiting: "{{count}} waiting",
		last: "Last synced {{time}}",
		never: "Not synced yet",
	},
	signOut: {
		action: "Sign out",
		unsynced_one: "{{count}} change is not synced and will be lost.",
		unsynced_other: "{{count}} changes are not synced and will be lost.",
		anyway: "Sign out anyway",
		cancel: "Cancel",
	},
	status: {
		open: "Open",
		assigned: "Assigned",
		in_progress: "In progress",
		done: "Done",
		cancelled: "Cancelled",
	},
	login: {
		title: "Sign in",
		email: "Email",
		password: "Password",
		submit: "Sign in",
		busy: "Signing in…",
		UNAUTHORIZED: "Wrong email or password.",
		ACCOUNT_DISABLED: "This account was disabled. Ask an admin to turn it on.",
		DEVICE_REVOKED: "This device was revoked by an admin.",
		DEVICE_TAKEN:
			"Changes from another account are still waiting on this device.",
	},
	revoked: {
		title: "Device revoked",
		body: "An admin locked this device out. Its copy of the work orders can no longer sync.",
		erase: "Erase this device's data",
	},
	account: {
		title: "Your account",
		password: "Change password",
		current: "Current password",
		next: "New password",
		repeat: "Repeat it",
		hint: "At least {{min}} characters. Your other devices will ask you to sign in again.",
		mismatch: "The two new passwords are not the same.",
		changed: "Password changed.",
		submit: "Change password",
		saving: "Saving…",
	},
	preferences: {
		title: "Preferences",
		language: "Language",
		theme: "Theme",
		system: "Device",
		light: "Light",
		dark: "Dark",
	},
	languages: { fr: "Français", en: "English" },
	errors: {
		offline: "No connection. This needs the network.",
		refused: "The server refused this.",
		BAD_REQUEST: "The server could not accept this. Check the fields.",
		FORBIDDEN: "Your role may not do this.",
		NOT_FOUND: "This person is no longer in the team.",
		EMAIL_TAKEN: "Someone in the team already uses this email.",
		OWN_ACCOUNT: "You cannot change your own role or disable yourself.",
		WRONG_PASSWORD: "The current password is not right.",
		RATE_LIMITED: "Too many attempts. Wait a few minutes and try again.",
	},
};
