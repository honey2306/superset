import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { getEditorTheme, type Theme } from "shared/themes";

export function getCodeSyntaxHighlighting(theme: Theme): Extension {
	const editorTheme = getEditorTheme(theme);
	const syntax = editorTheme.syntax;

	return syntaxHighlighting(
		HighlightStyle.define([
			// Keywords
			{
				tag: [tags.keyword, tags.operatorKeyword, tags.modifier],
				color: syntax.keyword,
			},
			// Comments
			{
				tag: [tags.comment, tags.lineComment, tags.blockComment],
				color: syntax.comment,
			},
			{
				tag: [tags.docComment],
				color: syntax.commentDoc ?? syntax.comment,
			},
			// Strings
			{
				tag: [tags.string],
				color: syntax.string,
			},
			{
				tag: [tags.special(tags.string)],
				color: syntax.stringSpecial ?? syntax.string,
			},
			{
				tag: [tags.escape],
				color: syntax.stringEscape ?? syntax.regexp,
			},
			// Numbers & Booleans
			{
				tag: [tags.number, tags.integer, tags.float],
				color: syntax.number,
			},
			{
				tag: [tags.bool, tags.null],
				color: syntax.boolean ?? syntax.number,
			},
			// Functions
			{
				tag: [
					tags.function(tags.variableName),
					tags.function(tags.propertyName),
				],
				color: syntax.functionCall,
			},
			{
				tag: [tags.definition(tags.function(tags.variableName))],
				color: syntax.functionCall,
			},
			// Properties
			{
				tag: [tags.propertyName],
				color: syntax.property ?? syntax.variableName,
			},
			{
				tag: [tags.definition(tags.propertyName)],
				color: syntax.property ?? syntax.variableName,
			},
			// Variables
			{
				tag: [tags.variableName],
				color: syntax.variableName,
			},
			{
				tag: [tags.definition(tags.variableName)],
				color: syntax.variableName,
			},
			{
				tag: [tags.local(tags.variableName)],
				color: syntax.variableName,
			},
			{
				tag: [tags.special(tags.variableName)],
				color: syntax.variableSpecial ?? syntax.variableName,
			},
			// Types
			{
				tag: [tags.typeName, tags.definition(tags.typeName)],
				color: syntax.typeName,
			},
			{
				tag: [tags.className],
				color: syntax.className,
			},
			{
				tag: [tags.namespace],
				color: syntax.namespace ?? syntax.typeName,
			},
			// Constants
			{
				tag: [tags.constant(tags.name), tags.standard(tags.name)],
				color: syntax.constant,
			},
			// Operators
			{
				tag: [
					tags.operator,
					tags.arithmeticOperator,
					tags.logicOperator,
					tags.compareOperator,
				],
				color: syntax.operator ?? syntax.plainText,
			},
			// Punctuation
			{
				tag: [tags.punctuation],
				color: syntax.punctuation ?? syntax.plainText,
			},
			{
				tag: [tags.bracket, tags.paren, tags.squareBracket, tags.brace],
				color:
					syntax.punctuationBracket ?? syntax.punctuation ?? syntax.plainText,
			},
			{
				tag: [tags.separator, tags.derefOperator],
				color:
					syntax.punctuationDelimiter ?? syntax.punctuation ?? syntax.plainText,
			},
			{
				tag: [tags.special(tags.brace)],
				color:
					syntax.punctuationSpecial ??
					syntax.punctuationBracket ??
					syntax.plainText,
			},
			// Regexp
			{
				tag: [tags.regexp, tags.special(tags.regexp)],
				color: syntax.regexp,
			},
			// HTML/XML
			{
				tag: [tags.tagName, tags.angleBracket],
				color: syntax.tagName,
			},
			{
				tag: [tags.attributeName],
				color: syntax.attributeName,
			},
			// Labels
			{
				tag: [tags.labelName],
				color: syntax.label ?? syntax.functionCall,
			},
			// Invalid
			{
				tag: [tags.invalid],
				color: syntax.invalid,
			},
		]),
	);
}
