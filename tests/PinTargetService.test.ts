import { describe, expect, it, vi } from "vitest";
import { resolvePinTarget } from "../src/services/PinTargetService";

interface FakeFile {
	basename: string;
	extension: string;
	path: string;
}

function file(path: string): FakeFile {
	const name = path.split("/").pop() ?? path;
	const parts = name.split(".");
	const extension = parts.length > 1 ? parts[parts.length - 1] ?? "" : "";
	const basename = extension ? name.slice(0, -extension.length - 1) : name;
	return { basename, extension, path };
}

describe("resolvePinTarget", () => {
	it("resolves an exact vault path before link resolution", () => {
		const exactTarget = file("World/Settlements/Harbor Gate.md");
		const linkTarget = file("Other/Harbor Gate.md");
		const deps = {
			vault: {
				getAbstractFileByPath: vi.fn(() => exactTarget),
			},
			metadataCache: {
				getFirstLinkpathDest: vi.fn(() => linkTarget),
			},
		};

		const resolved = resolvePinTarget(
			deps,
			"World/Settlements/Harbor Gate.md",
			"World/World.md",
		);

		expect(resolved).toBe(exactTarget);
		expect(deps.metadataCache.getFirstLinkpathDest).not.toHaveBeenCalled();
	});

	it("falls back to Obsidian link resolution when the target is not an exact path", () => {
		const linkTarget = file("World/Settlements/Harbor Gate.md");
		const deps = {
			vault: {
				getAbstractFileByPath: vi.fn(() => null),
			},
			metadataCache: {
				getFirstLinkpathDest: vi.fn(() => linkTarget),
			},
		};

		const resolved = resolvePinTarget(deps, "Harbor Gate", "World/World.md");

		expect(resolved).toBe(linkTarget);
		expect(deps.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith(
			"Harbor Gate",
			"World/World.md",
		);
	});

	it("normalizes wiki-link wrappers before link resolution", () => {
		const linkTarget = file("World/Settlements/Harbor Gate.md");
		const deps = {
			vault: {
				getAbstractFileByPath: vi.fn(() => null),
			},
			metadataCache: {
				getFirstLinkpathDest: vi.fn(() => linkTarget),
			},
		};

		const resolved = resolvePinTarget(deps, "[[Harbor Gate]]", "World/World.md");

		expect(resolved).toBe(linkTarget);
		expect(deps.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith(
			"Harbor Gate",
			"World/World.md",
		);
	});

	it("removes wiki-link aliases before link resolution", () => {
		const linkTarget = file("World/Settlements/Harbor Gate.md");
		const deps = {
			vault: {
				getAbstractFileByPath: vi.fn(() => null),
			},
			metadataCache: {
				getFirstLinkpathDest: vi.fn(() => linkTarget),
			},
		};

		const resolved = resolvePinTarget(deps, "[[Harbor Gate|Harbor]]", "World/World.md");

		expect(resolved).toBe(linkTarget);
		expect(deps.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith(
			"Harbor Gate",
			"World/World.md",
		);
	});
});
