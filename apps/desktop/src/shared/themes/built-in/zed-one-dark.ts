import type { Theme } from "../types";

/**
 * Zed One Dark theme
 *
 * Official color palette from zed-industries/zed:
 * assets/themes/one/one.json
 */
export const zedOneDark: Theme = {
	id: "zed-one-dark",
	name: "Zed One Dark",
	author: "Zed Industries",
	type: "dark",
	isBuiltIn: true,

	ui: {
		// Core backgrounds
		background: "#282c33",
		foreground: "#dce0e5",

		// Card/Panel backgrounds
		card: "#2f343e",
		cardForeground: "#dce0e5",

		// Popover/Dropdown
		popover: "#2f343e",
		popoverForeground: "#dce0e5",

		// Primary actions
		primary: "#74ade8",
		primaryForeground: "#ffffff",

		// Secondary elements
		secondary: "#363c46",
		secondaryForeground: "#dce0e5",

		// Muted/subtle elements
		muted: "#2e343e",
		mutedForeground: "#a9afbc",

		// Accent highlights
		accent: "#454a56",
		accentForeground: "#dce0e5",

		// Tertiary (panel toolbars)
		tertiary: "#2f343e",
		tertiaryActive: "#363c46",

		// Destructive actions
		destructive: "#d07277",
		destructiveForeground: "#ffffff",

		// Borders and inputs
		border: "#464b57",
		input: "#363c46",
		ring: "#47679e",

		// Sidebar specific
		sidebar: "#2f343e",
		sidebarForeground: "#dce0e5",
		sidebarPrimary: "#74ade8",
		sidebarPrimaryForeground: "#ffffff",
		sidebarAccent: "#454a56",
		sidebarAccentForeground: "#dce0e5",
		sidebarBorder: "#464b57",
		sidebarRing: "#47679e",

		// Chart colors
		chart1: "#d07277",
		chart2: "#a1c181",
		chart3: "#74ade8",
		chart4: "#dec184",
		chart5: "#6eb4bf",

		// Search highlight
		highlightMatch: "#74ade866",
		highlightActive: "#e8af7466",

		// Brand highlight
		highlight: "#74ade8",
		highlightForeground: "#ffffff",
	},

	terminal: {
		background: "#282c34",
		foreground: "#abb2bf",
		cursor: "#dce0e5",
		cursorAccent: "#282c34",
		selectionBackground: "#4d4d4d",

		// Standard ANSI colors
		black: "#282c34",
		red: "#e06c75",
		green: "#98c379",
		yellow: "#e5c07b",
		blue: "#61afef",
		magenta: "#c678dd",
		cyan: "#56b6c2",
		white: "#abb2bf",

		// Bright ANSI colors
		brightBlack: "#636d83",
		brightRed: "#EA858B",
		brightGreen: "#AAD581",
		brightYellow: "#FFD885",
		brightBlue: "#85C1FF",
		brightMagenta: "#D398EB",
		brightCyan: "#6ED5DE",
		brightWhite: "#fafafa",
	},

	editor: {
		colors: {
			background: "#282c33",
			foreground: "#acb2be",
			border: "#363c46",
			cursor: "#dce0e5",
			gutterBackground: "#282c33",
			gutterForeground: "#4e5a5f",
			activeLine: "#2f343ebf",
			selection: "#74ade83d",
			search: "#74ade866",
			searchActive: "#e8af7466",
			panel: "#2f343e",
			panelBorder: "#464b57",
			panelInputBackground: "#282c33",
			panelInputForeground: "#dce0e5",
			panelInputBorder: "#464b57",
			panelButtonBackground: "#363c46",
			panelButtonForeground: "#dce0e5",
			panelButtonBorder: "#464b57",
			diffBuffer: "#2f343e",
			diffHover: "#454a56",
			diffSeparator: "#464b57",
			addition: "#a1c181",
			deletion: "#d07277",
			modified: "#dec184",
		},
		syntax: {
			plainText: "#acb2be",
			comment: "#5d636f",
			commentDoc: "#878e98",
			keyword: "#b477cf",
			string: "#a1c181",
			stringEscape: "#6eb4bf",
			stringRegex: "#d07277",
			stringSpecial: "#d07277",
			number: "#bf956a",
			boolean: "#bf956a",
			functionCall: "#73ade9",
			variableName: "#acb2be",
			variableParameter: "#dce0e5",
			variableSpecial: "#dec184",
			typeName: "#6eb4bf",
			className: "#dec184",
			constant: "#dfc184",
			regexp: "#d07277",
			tagName: "#d07277",
			attributeName: "#74ade8",
			property: "#d07277",
			operator: "#6eb4bf",
			punctuation: "#acb2be",
			punctuationBracket: "#b2b9c6",
			punctuationDelimiter: "#b2b9c6",
			punctuationSpecial: "#b1574b",
			constructor: "#73ade9",
			namespace: "#dce0e5",
			enum: "#6eb4bf",
			label: "#74ade8",
			invalid: "#d07277",
		},
	},
};
