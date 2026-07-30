import { EditorView } from "@codemirror/view";
import { getEditorTheme, type Theme } from "shared/themes";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
} from "./constants";

interface CodeEditorFontSettings {
	fontFamily?: string;
	fontSize?: number;
}

export function createCodeMirrorTheme(
	theme: Theme,
	fontSettings: CodeEditorFontSettings,
	fillHeight: boolean,
) {
	const fontSize = fontSettings.fontSize ?? DEFAULT_CODE_EDITOR_FONT_SIZE;
	const lineHeight = 1.5; // Zed 使用固定 1.5 行高
	const editorTheme = getEditorTheme(theme);

	return EditorView.theme(
		{
			"&": {
				height: fillHeight ? "100%" : "auto",
				backgroundColor: editorTheme.colors.background,
				color: editorTheme.colors.foreground,
				fontFamily: fontSettings.fontFamily ?? DEFAULT_CODE_EDITOR_FONT_FAMILY,
				fontSize: `${fontSize}px`,
			},
			".cm-scroller": {
				fontFamily: "inherit",
				lineHeight: lineHeight.toString(),
				overflow: fillHeight ? "auto" : "visible",
				fontVariantLigatures: "contextual", // 启用连字
			},
			".cm-content": {
				padding: "16px 0", // Zed 风格更大的垂直 padding
				caretColor: editorTheme.colors.cursor,
			},
			".cm-line": {
				padding: "0 16px", // Zed 风格更大的水平 padding
			},
			".cm-gutters": {
				backgroundColor: editorTheme.colors.gutterBackground,
				color: editorTheme.colors.gutterForeground,
				border: "none", // Zed 无 gutter 分割线
				paddingRight: "8px",
			},
			".cm-gutterElement": {
				padding: "0 8px 0 16px", // 行号左右间距
			},
			".cm-lineNumbers .cm-gutterElement": {
				minWidth: "32px",
				textAlign: "right",
			},
			".cm-activeLine": {
				backgroundColor: editorTheme.colors.activeLine,
			},
			".cm-activeLineGutter": {
				backgroundColor: "transparent", // Zed 不高亮 gutter 背景
				color: editorTheme.colors.foreground, // active 行号用前景色
			},
			"&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
				{
					backgroundColor: editorTheme.colors.selection,
				},
			".cm-selectionMatch": {
				backgroundColor: editorTheme.colors.search,
			},
			".cm-cursor, .cm-dropCursor": {
				borderLeftColor: editorTheme.colors.cursor,
				borderLeftWidth: "2px", // Zed 光标稍粗
			},
			".cm-searchMatch": {
				backgroundColor: editorTheme.colors.search,
				outline: "none",
				borderRadius: "2px", // 搜索高亮圆角
			},
			".cm-searchMatch.cm-searchMatch-selected": {
				backgroundColor: editorTheme.colors.searchActive,
			},
			".cm-panels": {
				backgroundColor: editorTheme.colors.panel,
				color: editorTheme.colors.foreground,
				borderTop: `1px solid ${editorTheme.colors.panelBorder}`,
			},
			".cm-panels.cm-panels-top": {
				borderBottom: `1px solid ${editorTheme.colors.panelBorder}`,
				borderTop: "none",
			},
			".cm-panels .cm-textfield": {
				backgroundColor: editorTheme.colors.panelInputBackground,
				color: editorTheme.colors.panelInputForeground,
				border: `1px solid ${editorTheme.colors.panelInputBorder}`,
				borderRadius: "4px",
				padding: "4px 8px",
			},
			".cm-button": {
				backgroundImage: "none",
				backgroundColor: editorTheme.colors.panelButtonBackground,
				color: editorTheme.colors.panelButtonForeground,
				border: `1px solid ${editorTheme.colors.panelButtonBorder}`,
				borderRadius: "4px",
				padding: "4px 12px",
			},
		},
		{
			dark: theme.type === "dark",
		},
	);
}
