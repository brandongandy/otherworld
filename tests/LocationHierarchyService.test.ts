import { describe, expect, it, vi } from "vitest";
import { LocationHierarchyService } from "../src/services/LocationHierarchyService";
import type { MapPin } from "../src/types";

describe("LocationHierarchyService", () => {
	it("places parentless locations at the root", () => {
		const service = createService();

		const result = service.buildHierarchy({
			sourcePath: "World/World.md",
			locations: [
				location("Aldmere", "[[Aldmere]]", "Locations/Aldmere.md", {}),
				location("Red Ford", "[[Red Ford]]", "Locations/Red Ford.md", {}),
			],
		});

		expect(result.roots.map((node) => node.link)).toEqual(["[[Aldmere]]", "[[Red Ford]]"]);
		expect(result.warningGroups).toEqual([]);
	});

	it("uses entity note parentLocation before map pin parentLocation", () => {
		const service = createService({
			"Northern Marches": file("Locations/Northern Marches.md", "Northern Marches"),
			"Old Pin Parent": file("Locations/Old Pin Parent.md", "Old Pin Parent"),
		});

		const result = service.buildHierarchy({
			sourcePath: "World/World.md",
			locations: [
				location("Aldmere", "[[Aldmere]]", "Locations/Aldmere.md", {
					pinParentLocation: "[[Old Pin Parent]]",
					frontmatter: {
						parentLocation: "[[Northern Marches]]",
					},
				}),
			],
		});

		expect(result.roots).toEqual([
			{
				link: "[[Northern Marches]]",
				label: "Northern Marches",
				children: [
					{
						link: "[[Aldmere]]",
						label: "Aldmere",
						children: [],
					},
				],
			},
		]);
	});

	it("ignores map pin parentLocation when an entity note exists without a parent", () => {
		const service = createService({
			"Northern Marches": file("Locations/Northern Marches.md", "Northern Marches"),
		});

		const result = service.buildHierarchy({
			sourcePath: "World/World.md",
			locations: [
				location("Aldmere", "[[Aldmere]]", "Locations/Aldmere.md", {
					pinParentLocation: "[[Northern Marches]]",
					frontmatter: {},
				}),
			],
		});

		expect(result.roots.map((node) => node.link)).toEqual(["[[Aldmere]]"]);
		expect(result.warningGroups).toEqual([]);
	});

	it("includes resolved parent note chains that are not pinned", () => {
		const service = createService({
			"Northern Marches": file("Locations/Northern Marches.md", "Northern Marches"),
			Valoria: file("Locations/Valoria.md", "Valoria"),
		}, {
			"Locations/Northern Marches.md": {
				parentLocation: "[[Valoria]]",
			},
		});

		const result = service.buildHierarchy({
			sourcePath: "World/World.md",
			locations: [
				location("Aldmere", "[[Aldmere]]", "Locations/Aldmere.md", {
					frontmatter: {
						parentLocation: "[[Northern Marches]]",
					},
				}),
			],
		});

		expect(result.roots).toEqual([
			{
				link: "[[Valoria]]",
				label: "Valoria",
				children: [
					{
						link: "[[Northern Marches]]",
						label: "Northern Marches",
						children: [
							{
								link: "[[Aldmere]]",
								label: "Aldmere",
								children: [],
							},
						],
					},
				],
			},
		]);
	});

	it("uses the resolved entity file to match folder-qualified pinned parents", () => {
		const service = createService({
			"Regions/Northern Marches": file("Regions/Northern Marches.md", "Northern Marches"),
		});

		const result = service.buildHierarchy({
			sourcePath: "World/World.md",
			locations: [
				location("Northern Marches", "[[Regions/Northern Marches]]", "Regions/Northern Marches.md", {}),
				location("Aldmere", "[[Aldmere]]", "Locations/Aldmere.md", {
					frontmatter: {
						parentLocation: "[[Regions/Northern Marches]]",
					},
				}),
			],
		});

		expect(result.roots).toEqual([
			{
				link: "[[Regions/Northern Marches]]",
				label: "Northern Marches",
				children: [
					{
						link: "[[Aldmere]]",
						label: "Aldmere",
						children: [],
					},
				],
			},
		]);
	});

	it("falls back to pin parentLocation when the entity note is missing", () => {
		const service = createService({
			"Northern Marches": file("Locations/Northern Marches.md", "Northern Marches"),
		});

		const result = service.buildHierarchy({
			sourcePath: "World/World.md",
			locations: [
				location("Aldmere", "[[Aldmere]]", "Locations/Aldmere.md", {
					pinParentLocation: "[[Northern Marches]]",
					entityFileMissing: true,
				}),
			],
		});

		expect(result.roots[0]?.link).toBe("[[Northern Marches]]");
		expect(result.roots[0]?.children[0]?.link).toBe("[[Aldmere]]");
		expect(result.warningGroups[0]?.heading).toBe("Missing entity notes");
	});

	it("reports unresolved parents and keeps the child discoverable at the root", () => {
		const service = createService();

		const result = service.buildHierarchy({
			sourcePath: "World/World.md",
			locations: [
				location("Aldmere", "[[Aldmere]]", "Locations/Aldmere.md", {
					frontmatter: {
						parentLocation: "[[Northern Marches]]",
					},
				}),
			],
		});

		expect(result.roots.map((node) => node.link)).toEqual(["[[Aldmere]]"]);
		expect(result.warningGroups).toEqual([
			{
				heading: "Unresolved location parents",
				items: ["[[Aldmere]] references missing parent [[Northern Marches]]."],
			},
		]);
	});

	it("reports cycles and excludes affected entries from the normal tree", () => {
		const service = createService({
			A: file("Locations/A.md", "A"),
			B: file("Locations/B.md", "B"),
		});

		const result = service.buildHierarchy({
			sourcePath: "World/World.md",
			locations: [
				location("A", "[[A]]", "Locations/A.md", {
					frontmatter: {
						parentLocation: "[[B]]",
					},
				}),
				location("B", "[[B]]", "Locations/B.md", {
					frontmatter: {
						parentLocation: "[[A]]",
					},
				}),
			],
		});

		expect(result.roots).toEqual([]);
		expect(result.warningGroups).toEqual([
			{
				heading: "Location hierarchy cycles",
				items: ["Cycle detected: [[A]] -> [[B]] -> [[A]]."],
			},
		]);
	});

	it("deduplicates duplicate location links", () => {
		const service = createService();

		const result = service.buildHierarchy({
			sourcePath: "World/World.md",
			locations: [
				location("Aldmere", "[[Aldmere]]", "Locations/Aldmere.md", {}),
				location("Aldmere duplicate", "[[Aldmere|City]]", "Locations/Aldmere.md", {}),
			],
		});

		expect(result.roots.map((node) => node.link)).toEqual(["[[Aldmere]]"]);
		expect(result.duplicateCount).toBe(1);
	});
});

function createService(
	resolvedLinks: Record<string, FakeFile> = {},
	frontmatterByPath: Record<string, Record<string, unknown>> = {},
): LocationHierarchyService {
	return new LocationHierarchyService({
		resolveLink: vi.fn((target: string) => resolvedLinks[target] ?? null),
		loadFrontmatter: vi.fn((fileArg: FakeFile) => frontmatterByPath[fileArg.path] ?? {}),
	});
}

function location(
	name: string,
	link: string,
	entityPath: string,
	options: {
		frontmatter?: Record<string, unknown>;
		pinParentLocation?: string;
		entityFileMissing?: boolean;
	},
) {
	const pin: MapPin = {
		id: `world__location__${name.toLowerCase().replace(/\s+/g, "_")}`,
		name,
		link,
		entityPath,
		type: "location",
		parentLocation: options.pinParentLocation,
		x: 0.5,
		y: 0.5,
	};

	return {
		pin,
		entityFile: options.entityFileMissing ? null : file(entityPath, name),
		frontmatter: options.frontmatter,
	};
}

interface FakeFile {
	path: string;
	basename: string;
	extension: string;
}

function file(path: string, basename: string): FakeFile {
	return {
		path,
		basename,
		extension: "md",
	};
}
