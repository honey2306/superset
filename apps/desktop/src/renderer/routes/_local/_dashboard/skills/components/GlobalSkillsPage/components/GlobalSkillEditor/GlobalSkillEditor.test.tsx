import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "renderer/providers/I18nProvider";
import { LOCALE_STORAGE_KEY } from "renderer/providers/I18nProvider/messages";
import { SkillPreview } from "./components/SkillPreview/SkillPreview";
import {
	GlobalSkillEditor,
	type GlobalSkillEditorValue,
} from "./GlobalSkillEditor";

const value: GlobalSkillEditorValue = {
	name: "verify-change",
	description: "Use for behavior changes",
	instructions: "# A method",
	invocation: "auto",
	revision: null,
};
const render = (dirty: boolean, manual = false) => {
	window.localStorage.setItem(LOCALE_STORAGE_KEY, "en-US");
	return renderToStaticMarkup(
		<I18nProvider>
			<GlobalSkillEditor
				value={{ ...value, invocation: manual ? "manual" : "auto" }}
				isSaving={false}
				isDirty={dirty}
				onChange={() => {}}
				onSave={() => {}}
			/>
		</I18nProvider>,
	);
};
describe("skill editor display and safe previews", () => {
	test("names, matching description and body are clearly separated", () => {
		const html = render(true);
		expect(html).toContain("Skill name");
		expect(html).toContain("When to use");
		expect(html).toContain("Instructions");
		expect(html).toContain("Unsaved changes");
	});
	test("manual invocation preference is not called an execution permission", () => {
		const html = render(false, true);
		expect(html).toContain("Explicit use only");
		expect(html).toContain("checked");
		expect(html).toContain("Saved on disk");
	});
	test("Markdown preview never runs HTML, JavaScript links or remote image requests", () => {
		const html = renderToStaticMarkup(
			<SkillPreview
				content={
					"# Method\n\n<script>alert(1)</script>\n\n[link](javascript:alert(1))\n\n![reference](https://remote.invalid/pixel.png)\n\n```sh\nrm -rf example\n```"
				}
			/>,
		);
		expect(html).toContain("Method");
		expect(html).not.toContain("<script");
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain("<img");
		expect(html).not.toContain('src="https://remote');
		expect(html).toContain("rm -rf example");
	});
});
