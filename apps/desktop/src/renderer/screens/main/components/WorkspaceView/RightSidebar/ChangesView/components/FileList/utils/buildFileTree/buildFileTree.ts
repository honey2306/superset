import type { ChangedFile } from "shared/changes-types";

export interface FileTreeNode {
	id: string;
	name: string;
	type: "file" | "folder";
	path: string;
	file?: ChangedFile;
	children?: FileTreeNode[];
}

type InternalFileTreeNode = Omit<FileTreeNode, "children"> & {
	children?: Record<string, InternalFileTreeNode>;
};

function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
	return nodes.sort((a, b) => {
		if (a.type !== b.type) {
			return a.type === "folder" ? -1 : 1;
		}
		return a.name.localeCompare(b.name);
	});
}

function compactFolder(node: FileTreeNode): FileTreeNode {
	if (node.type !== "folder") {
		return node;
	}

	let name = node.name;
	let path = node.path;
	let children = node.children?.map(compactFolder) ?? [];

	while (children.length === 1 && children[0]?.type === "folder") {
		const child = children[0];
		name = `${name}/${child.name}`;
		path = child.path;
		children = child.children ?? [];
	}

	return {
		...node,
		id: path,
		name,
		path,
		children,
	};
}

export function buildFileTree(files: ChangedFile[]): FileTreeNode[] {
	const root: Record<string, InternalFileTreeNode> = {};

	for (const file of files) {
		const parts = file.path.split("/");
		let current = root;

		for (let index = 0; index < parts.length; index++) {
			const part = parts[index];
			const isFile = index === parts.length - 1;
			const path = parts.slice(0, index + 1).join("/");

			current[part] ??= {
				id: path,
				name: part,
				type: isFile ? "file" : "folder",
				path,
				file: isFile ? file : undefined,
				children: isFile ? undefined : {},
			};

			if (!isFile && current[part].children) {
				current = current[part].children;
			}
		}
	}

	const toArray = (
		nodes: Record<string, InternalFileTreeNode>,
	): FileTreeNode[] =>
		sortNodes(
			Object.values(nodes).map((node) => ({
				...node,
				children: node.children ? toArray(node.children) : undefined,
			})),
		);

	return toArray(root).map(compactFolder);
}
