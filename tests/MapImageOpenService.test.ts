import { describe, expect, it, vi } from "vitest";
import {
	buildInitialMapMetadataContent,
	createMapMetadataForImage,
	getMapMetadataPathForImage,
	isSameNameSupportedMapImage,
} from "../src/services/MapImageOpenService";

interface FakeFolder {
	name: string;
	path: string;
	children: unknown[];
}

interface FakeFile {
	name: string;
	basename: string;
	extension: string;
	path: string;
	parent: FakeFolder | null;
}

function folder(name: string, path: string): FakeFolder {
	return { name, path, children: [] };
}

function file(name: string, path: string, parent: FakeFolder | null): FakeFile {
	const extensionStart = name.lastIndexOf(".");
	const extension = extensionStart === -1 ? "" : name.slice(extensionStart + 1);
	const basename = extensionStart === -1 ? name : name.slice(0, extensionStart);
	const created = { name, basename, extension, path, parent };
	parent?.children.push(created);
	return created;
}

describe("MapImageOpenService", () => {
	it("identifies same-name supported map images", () => {
		const world = folder("World", "World");
		const image = file("World.PNG", "World/World.PNG", world);

		expect(isSameNameSupportedMapImage(image as never)).toBe(true);
	});

	it("rejects unsupported or mismatched image files", () => {
		const world = folder("World", "World");

		expect(isSameNameSupportedMapImage(file("Other.png", "World/Other.png", world) as never)).toBe(false);
		expect(isSameNameSupportedMapImage(file("World.svg", "World/World.svg", world) as never)).toBe(false);
		expect(isSameNameSupportedMapImage(file("World.png", "World.png", null) as never)).toBe(false);
		expect(isSameNameSupportedMapImage(null)).toBe(false);
	});

	it("computes the expected same-name metadata path", () => {
		const world = folder("World", "World");
		const image = file("World.png", "World/World.png", world);

		expect(getMapMetadataPathForImage(image as never)).toBe("World/World.md");
	});

	it("builds initial map metadata content", () => {
		expect(buildInitialMapMetadataContent("World", "World.png")).toBe([
			"---",
			"worldbuildingMap:",
			"  image: World.png",
			"  coordinateSystem: normalizedImage",
			"  pins: []",
			"---",
			"",
			"# World",
			"",
		].join("\n"));
	});

	it("quotes YAML-sensitive image names in initial map metadata", () => {
		expect(buildInitialMapMetadataContent("World", "World #1's [draft].png")).toContain(
			"  image: 'World #1''s [draft].png'",
		);
	});

	it("returns an existing metadata file without overwriting it", async () => {
		const world = folder("World", "World");
		const image = file("World.png", "World/World.png", world);
		const metadata = file("World.md", "World/World.md", world);
		const vault = {
			getAbstractFileByPath: vi.fn(() => metadata),
			create: vi.fn(),
		};

		await expect(createMapMetadataForImage(vault, image as never)).resolves.toBe(metadata);
		expect(vault.create).not.toHaveBeenCalled();
	});

	it("creates missing metadata with initial map frontmatter", async () => {
		const world = folder("World", "World");
		const image = file("World.png", "World/World.png", world);
		const metadata = file("World.md", "World/World.md", world);
		const vault = {
			getAbstractFileByPath: vi.fn(() => null),
			create: vi.fn(async () => metadata),
		};

		await expect(createMapMetadataForImage(vault, image as never)).resolves.toBe(metadata);
		expect(vault.create).toHaveBeenCalledWith(
			"World/World.md",
			buildInitialMapMetadataContent("World", "World.png"),
		);
	});
});
