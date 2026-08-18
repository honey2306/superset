import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FolderRowHeader } from "./FolderRowHeader";

describe("FolderRowHeader", () => {
	test("indents nested folder chevrons after continuous level guides", () => {
		const markup = renderToStaticMarkup(
			<FolderRowHeader
				name="session"
				level={2}
				isGrouped={false}
				isExpanded={true}
			/>,
		);

		const guidesIndex = markup.indexOf("data-tree-level-guides");
		const chevronIndex = markup.indexOf("<svg");
		expect(guidesIndex).toBeGreaterThan(-1);
		expect(chevronIndex).toBeGreaterThan(guidesIndex);
		expect(markup.match(/border-line(?=["\s])/g)).toHaveLength(2);
	});

	test("does not render tree controls in grouped mode", () => {
		const markup = renderToStaticMarkup(
			<FolderRowHeader
				name="src"
				level={2}
				isGrouped={true}
				isExpanded={true}
			/>,
		);

		expect(markup).not.toContain("data-tree-level-guides");
		expect(markup).not.toContain("<svg");
	});
});
