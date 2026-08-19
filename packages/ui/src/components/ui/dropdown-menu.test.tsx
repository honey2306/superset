import { describe, expect, test } from "bun:test";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";

import { DropdownMenuSubContent } from "./dropdown-menu";

describe("DropdownMenuSubContent", () => {
	test("renders submenu content through a portal", () => {
		const ref = { current: null };
		const element = DropdownMenuSubContent({
			children: "Submenu item",
			className: "custom-class",
			sideOffset: 8,
			ref,
		});

		expect(element.type).toBe(DropdownMenuPrimitive.Portal);

		const subContent = element.props.children;
		expect(subContent.type).toBe(DropdownMenuPrimitive.SubContent);
		expect(subContent.props.children).toBe("Submenu item");
		expect(subContent.props.className).toContain("custom-class");
		expect(subContent.props.sideOffset).toBe(8);
		expect(subContent.props.ref).toBe(ref);
	});
});
