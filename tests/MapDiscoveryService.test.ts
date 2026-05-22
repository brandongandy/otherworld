import { describe, expect, it } from "vitest";
import { MapDiscoveryService } from "../src/services/MapDiscoveryService";

interface FakeAbstractFile {
	name: string;
	path: string;
	parent: FakeFolder | null;
}

interface FakeFile extends FakeAbstractFile {
	basename: string;
	extension: string;
}

interface FakeFolder extends FakeAbstractFile {
	children: FakeAbstractFile[];
}

function folder(name: string, path: string, parent: FakeFolder | null): FakeFolder {
	const created = { name, path, parent, children: [] };
	parent?.children.push(created);
	return created;
}

function file(name: string, path: string, parent: FakeFolder): FakeFile {
	const parts = name.split(".");
	const extension = parts.length > 1 ? parts[parts.length - 1] ?? "" : "";
	const basename = extension ? name.slice(0, -extension.length - 1) : name;
	const created = { name, path, parent, basename, extension };
	parent.children.push(created);
	return created;
}

function vault(files: FakeAbstractFile[]) {
	const byPath = new Map(files.map((entry) => [entry.path, entry]));

	return {
		getAbstractFileByPath(path: string): FakeAbstractFile | null {
			return byPath.get(path) ?? null;
		},
	};
}

describe("MapDiscoveryService", () => {
	it("resolves a map from its metadata file", () => {
		const root = folder("", "", null);
		const world = folder("World", "World", root);
		const metadata = file("World.md", "World/World.md", world);
		const image = file("World.png", "World/World.png", world);
		const service = new MapDiscoveryService(vault([root, world, metadata, image]));

		const resolved = service.resolveFromAbstractFile(metadata as never);

		expect(resolved).toMatchObject({
			folderPath: "World",
			name: "World",
			metadataFile: metadata,
			imageFile: image,
		});
	});

	it("resolves a map from a nested file inside the map folder", () => {
		const root = folder("", "", null);
		const world = folder("World", "World", root);
		const settlements = folder("Settlements", "World/Settlements", world);
		const nested = file("Harbor Gate.md", "World/Settlements/Harbor Gate.md", settlements);
		const metadata = file("World.md", "World/World.md", world);
		const image = file("World.webp", "World/World.webp", world);
		const service = new MapDiscoveryService(vault([root, world, settlements, nested, metadata, image]));

		const resolved = service.resolveFromAbstractFile(nested as never);

		expect(resolved?.metadataFile).toBe(metadata);
		expect(resolved?.imageFile).toBe(image);
	});

	it("resolves a map image with an uppercase extension", () => {
		const root = folder("", "", null);
		const world = folder("World", "World", root);
		const metadata = file("World.md", "World/World.md", world);
		const image = file("World.PNG", "World/World.PNG", world);
		const service = new MapDiscoveryService(vault([root, world, metadata, image]));

		const resolved = service.resolveFromAbstractFile(metadata as never);

		expect(resolved?.imageFile).toBe(image);
	});

	it("continues to an ancestor when a child folder has same-name markdown without an image", () => {
		const root = folder("", "", null);
		const world = folder("World", "World", root);
		const region = folder("Region", "World/Region", world);
		const nested = file("Location.md", "World/Region/Location.md", region);
		const childMetadata = file("Region.md", "World/Region/Region.md", region);
		const worldMetadata = file("World.md", "World/World.md", world);
		const worldImage = file("World.jpg", "World/World.jpg", world);
		const service = new MapDiscoveryService(vault([
			root,
			world,
			region,
			nested,
			childMetadata,
			worldMetadata,
			worldImage,
		]));

		const resolved = service.resolveFromAbstractFile(nested as never);

		expect(resolved?.folderPath).toBe("World");
		expect(resolved?.metadataFile).toBe(worldMetadata);
		expect(resolved?.imageFile).toBe(worldImage);
	});
});
