// Auth
export const AUTH_PROVIDERS = ["github", "google"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const ORGANIZATION_HEADER = "x-superset-organization-id";

// Deep link protocol schemes (used for desktop OAuth callbacks)
export const PROTOCOL_SCHEMES = {
	DEV: "superset-dev",
	PROD: "superset",
} as const;

// Company
export const COMPANY = {
	NAME: "Superset",
	DOMAIN: "superset.sh",
	EMAIL_DOMAIN: "@superset.sh",
	GITHUB_URL: "https://github.com/superset-sh/superset",
	DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.superset.sh",
	MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL || "https://superset.sh",
	TERMS_URL: `${process.env.NEXT_PUBLIC_MARKETING_URL || "https://superset.sh"}/terms`,
	PRIVACY_URL:
		(process.env.NEXT_PUBLIC_MARKETING_URL || "https://superset.sh") +
		"/privacy",
	CHANGELOG_URL:
		(process.env.NEXT_PUBLIC_MARKETING_URL || "https://superset.sh") +
		"/changelog",
	X_URL: "https://x.com/superset_sh",
	LINKEDIN_URL: "https://www.linkedin.com/company/superset-sh",
	YOUTUBE_URL: "https://www.youtube.com/@superset-sh",
	MAIL_TO: "mailto:support@superset.sh",
	FOUNDERS_EMAIL: "founders@superset.sh",
	FOUNDERS_MAIL_TO: "mailto:founders@superset.sh",
	REPORT_ISSUE_URL: "https://github.com/superset-sh/superset/issues/new",
	DISCORD_URL: "https://discord.gg/cZeD9WYcV7",
	STATUS_URL: "https://status.superset.sh",
	TRUST_URL: "https://trust.superset.sh",
	JOIN_US_URL: `${process.env.NEXT_PUBLIC_MARKETING_URL || "https://superset.sh"}/join-us`,
	/** The formal YC listing; product surfaces link here. `JOIN_US_URL` is our own marketing page. */
	CAREERS_URL: "https://www.ycombinator.com/companies/superset/jobs",
} as const;

export const OPEN_ROLES = [
	{
		title: "Founding Engineer",
		location: "San Francisco, CA",
		url: "https://www.ycombinator.com/companies/superset/jobs/Nd9luiP-founding-engineer",
	},
] as const;

// Theme
export const THEME_STORAGE_KEY = "superset-theme";

// Download URLs
export const DOWNLOAD_URL_MAC_ARM64 = `${COMPANY.GITHUB_URL}/releases/latest/download/Superset-arm64.dmg`;
export const DOWNLOAD_URL_MAC_X64 = `${COMPANY.GITHUB_URL}/releases/latest/download/Superset-x64.dmg`;

// Auth token configuration
export const TOKEN_CONFIG = {
	/** Access token lifetime in seconds (1 hour) */
	ACCESS_TOKEN_EXPIRY: 60 * 60,
	/** Refresh token lifetime in seconds (30 days) */
	REFRESH_TOKEN_EXPIRY: 30 * 24 * 60 * 60,
	/** Refresh access token when this many seconds remain (5 minutes) */
	REFRESH_THRESHOLD: 5 * 60,
} as const;

// Workspace teardown
export const TEARDOWN_TIMEOUT_MS = 60_000;

// PostHog
export const POSTHOG_COOKIE_NAME = "superset";

export const FEATURE_FLAGS = {
	/** Gates access to the experimental mobile-first agents UI on web. */
	WEB_AGENTS_UI_ACCESS: "web-agents-ui-access",
	/** Gates access to GitHub integration (currently buggy, internal only). */
	GITHUB_INTEGRATION_ACCESS: "github-integration-access",
	/** When enabled, blocks remote agent execution on the desktop (e.g., for enterprise orgs). */
	DISABLE_REMOTE_AGENT: "disable-remote-agent",
	/**
	 * Shows the "We're Hiring" card in the dashboard sidebar. Targets a static
	 * PostHog cohort of users who have created 10+ workspaces all-time, which is
	 * the only place that history exists — workspace rows are hard-deleted, so a
	 * lifetime count can't be derived from the DB. The cohort is a frozen
	 * snapshot because PostHog rejects behavioral cohorts in flags; re-populate
	 * it to reach users who cross the threshold later.
	 */
	HIRING_BANNER: "hiring-banner",
} as const;

// Terminal identity presented to shell programs via TERM_PROGRAM. kitty:
// agent TUIs (claude-code especially) tune wheel-scroll compensation per
// TERM_PROGRAM, and our terminals install the full-fidelity wheel handler
// (@superset/shared/terminal-wheel-handler) that produces a native
// kitty/iTerm-grade report stream. Under kitty-class identities TUIs trust
// that stream as-is; a vscode identity would make claude-code amplify each
// report (its compensation for xterm.js's damped stock stream) and
// over-scroll ~3x. The identity and the wheel handler must ship together —
// reverting one without the other reintroduces slow or runaway scrolling.
// Kitty *keyboard protocol* support is advertised separately via the CSI-u
// capability probe.
export const TERMINAL_TERM_PROGRAM = "kitty";
// A plausible kitty version: TUIs may version-gate quirk handling against
// real kitty releases, so keep this roughly current when touching terminal code.
export const TERMINAL_TERM_PROGRAM_VERSION = "0.42.0";
