import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/settings";
import { MapEntityIndexService } from "../src/services/MapEntityIndexService";
import type { MapPin, ResolvedMap } from "../src/types";

describe("MapEntityIndexService", () => {
	it("creates a typed map entity index next to the map note", async () => {
		const context = createContext([
			pin("location", "Aldmere", "Locations/Aldmere.md"),
			pin("event", "Battle of Red Ford", "Events/Battle of Red Ford.md"),
			pin("person", "Mira Vale", "People/Mira Vale.md"),
			pin("faction", "Cartographers Guild", "Factions/Cartographers Guild.md"),
			pin("item", "Crown of Glass", "Items/Crown of Glass.md"),
		]);
		const { service, vault } = createService(context);

		const result = await service.generateIndex({
			map: context.map,
			settings: DEFAULT_SETTINGS,
		});

		expect(result.indexPath).toBe("World/World Index.md");
		expect(result.created).toBe(true);
		expect(result.counts).toMatchObject({
			location: 1,
			event: 1,
			person: 1,
			faction: 1,
			item: 1,
		});
		expect(vault.create).toHaveBeenCalledWith("World/World Index.md", expect.stringContaining("## Locations"));
		expect(context.createdContent.get("World/World Index.md")).toContain("- [[Aldmere]]");
		expect(context.createdContent.get("World/World Index.md")).toContain("## Events");
		expect(context.createdContent.get("World/World Index.md")).toContain("- [[Battle of Red Ford]]");
	});

	it("uses configured filename pattern and modifies existing index content safely", async () => {
		const context = createContext([
			pin("item", "Crown of Glass", "Items/Crown of Glass.md"),
		]);
		const existingIndex = file("Index - World.md", "World/Index - World.md", context.folder);
		context.files.set(existingIndex.path, existingIndex);
		context.fileContents.set(existingIndex.path, "# Index - World\n\nManual note.\n");
		const { service, vault } = createService(context);

		const result = await service.generateIndex({
			map: context.map,
			settings: {
				...DEFAULT_SETTINGS,
				indexFilenamePattern: "Index - {{mapName}}",
			},
		});

		expect(result.indexPath).toBe("World/Index - World.md");
		expect(result.created).toBe(false);
		expect(vault.modify).toHaveBeenCalledWith(existingIndex, expect.stringContaining("Manual note."));
		expect(context.modifiedContent.get(existingIndex.path)).toContain("- [[Crown of Glass]]");
	});

	it("reports unsupported pin types and duplicate links", async () => {
		const context = createContext([
			pin("location", "Aldmere", "Locations/Aldmere.md"),
			{
				...pin("location", "Aldmere duplicate", "Locations/Aldmere.md"),
				link: "[[Aldmere|City]]",
			},
			pin("planet", "Mars", "Mars.md"),
		]);
		const { service } = createService(context);

		const result = await service.generateIndex({
			map: context.map,
			settings: DEFAULT_SETTINGS,
		});

		expect(result.counts.location).toBe(1);
		expect(result.warningCounts.duplicateLinks).toBe(1);
		expect(result.warningCounts.unsupportedPins).toBe(1);
		expect(result.notice).toContain("1 duplicate link");
		expect(result.notice).toContain("1 unsupported pin");
	});

	it("reports missing linked entity notes without blocking generation", async () => {
		const context = createContext([
			pin("location", "Old Watchtower", "Locations/Old Watchtower.md"),
		], {
			missingEntityPaths: new Set(["Locations/Old Watchtower.md"]),
		});
		const { service } = createService(context);

		const result = await service.generateIndex({
			map: context.map,
			settings: DEFAULT_SETTINGS,
		});

		expect(result.warningCounts.missingEntityNotes).toBe(1);
		const content = context.createdContent.get("World/World Index.md") ?? "";
		expect(content).toContain("## Index warnings");
		expect(content).toContain("[[Old Watchtower]] points to `Locations/Old Watchtower.md`");
		expect(content.match(/\[\[Old Watchtower]] points to `Locations\/Old Watchtower.md`/g)).toHaveLength(1);
	});

	it("rejects an index path that collides with the map metadata note", async () => {
		const context = createContext([
			pin("location", "Aldmere", "Locations/Aldmere.md"),
		]);
		const { service, vault } = createService(context);

		await expect(service.generateIndex({
			map: context.map,
			settings: {
				...DEFAULT_SETTINGS,
				indexFilenamePattern: "{{mapName}}",
			},
		})).rejects.toThrow("Index path would overwrite an existing map or entity note: World/World.md");

		expect(vault.read).not.toHaveBeenCalled();
		expect(vault.modify).not.toHaveBeenCalled();
		expect(vault.create).not.toHaveBeenCalled();
	});

	it("rejects an index path that collides with a resolved entity note", async () => {
		const context = createContext([
			pin("item", "World Index", "World/World Index.md"),
		]);
		const { service, vault } = createService(context);

		await expect(service.generateIndex({
			map: context.map,
			settings: DEFAULT_SETTINGS,
		})).rejects.toThrow("Index path would overwrite an existing map or entity note: World/World Index.md");

		expect(vault.read).not.toHaveBeenCalled();
		expect(vault.modify).not.toHaveBeenCalled();
		expect(vault.create).not.toHaveBeenCalled();
	});

	it("rejects an index path that collides with an unsupported pin entity note", async () => {
		const context = createContext([
			pin("planet", "World Index", "World/World Index.md"),
		]);
		const { service, vault } = createService(context);

		await expect(service.generateIndex({
			map: context.map,
			settings: DEFAULT_SETTINGS,
		})).rejects.toThrow("Index path would overwrite an existing map or entity note: World/World Index.md");

		expect(vault.read).not.toHaveBeenCalled();
		expect(vault.modify).not.toHaveBeenCalled();
		expect(vault.create).not.toHaveBeenCalled();
	});

	it("rejects an index path that collides with an unpinned hierarchy parent note", async () => {
		const context = createContext([
			pin("location", "Aldmere", "Locations/Aldmere.md"),
		]);
		const parent = file("World Index.md", "World/World Index.md", context.folder);
		context.files.set(parent.path, parent);
		context.fileContents.set(parent.path, "# World Index\n\nExisting parent note.\n");
		context.frontmatter.set("Locations/Aldmere.md", {
			parentLocation: "[[World Index]]",
		});
		const { service, vault } = createService(context);

		await expect(service.generateIndex({
			map: context.map,
			settings: DEFAULT_SETTINGS,
		})).rejects.toThrow("Index path would overwrite an existing map or entity note: World/World Index.md");

		expect(vault.read).not.toHaveBeenCalled();
		expect(vault.modify).not.toHaveBeenCalled();
		expect(vault.create).not.toHaveBeenCalled();
	});

	it("keeps duplicate resolved location counts and warnings consistent", async () => {
		const context = createContext([
			pin("location", "Aldmere", "Locations/Aldmere.md"),
			{
				...pin("location", "Aldmere qualified", "Locations/Aldmere.md"),
				link: "[[Locations/Aldmere]]",
			},
		]);
		const { service } = createService(context);

		const result = await service.generateIndex({
			map: context.map,
			settings: DEFAULT_SETTINGS,
		});

		expect(result.counts.location).toBe(1);
		expect(result.warningCounts.duplicateLinks).toBe(1);
		const content = context.createdContent.get("World/World Index.md") ?? "";
		expect(content).toContain("## Index warnings");
		expect(content).toContain("### Duplicate links");
		expect(content).toContain("1 duplicate link skipped.");
	});

	it("keeps duplicate unresolved parent counts and warnings consistent", async () => {
		const context = createContext([
			pin("location", "Aldmere", "Locations/Aldmere.md"),
			pin("location", "Red Ford", "Locations/Red Ford.md"),
		]);
		const parent = file("Northern Marches.md", "Locations/Northern Marches.md", context.folder);
		context.files.set(parent.path, parent);
		context.frontmatter.set("Locations/Aldmere.md", {
			parentLocation: "[[Northern Marches]]",
		});
		context.frontmatter.set("Locations/Red Ford.md", {
			parentLocation: "[[Northern Marches]]",
		});
		context.frontmatter.set(parent.path, {
			parentLocation: "[[Valoria]]",
		});
		const { service } = createService(context);

		const result = await service.generateIndex({
			map: context.map,
			settings: DEFAULT_SETTINGS,
		});

		expect(result.warningCounts.unresolvedParents).toBe(1);
		expect(result.notice).toContain("1 unresolved parent");
		const content = context.createdContent.get("World/World Index.md") ?? "";
		expect(content).toContain("### Unresolved location parents");
		expect(content.match(/\[\[Northern Marches]] references missing parent \[\[Valoria]]./g)).toHaveLength(1);
	});
});

function createService(context: ReturnType<typeof createContext>) {
	const vault = {
		getAbstractFileByPath: vi.fn((path: string) => context.files.get(path) ?? null),
		read: vi.fn(async (fileArg: FakeFile) => context.fileContents.get(fileArg.path) ?? ""),
		create: vi.fn(async (path: string, content: string) => {
			const created = file(path.split("/").pop() ?? path, path, context.folder);
			context.files.set(path, created);
			context.createdContent.set(path, content);
			return created;
		}),
		modify: vi.fn(async (fileArg: FakeFile, content: string) => {
			context.modifiedContent.set(fileArg.path, content);
			context.fileContents.set(fileArg.path, content);
		}),
	};

	return {
		vault,
		service: new MapEntityIndexService({
			vault: vault as never,
			loadMapMetadata: () => ({ pins: context.pins }),
			loadFrontmatter: (fileArg) => context.frontmatter.get((fileArg as FakeFile).path) ?? {},
			resolveTarget: (target) => context.resolveTarget(target),
		}),
	};
}

function createContext(pins: MapPin[], options: { missingEntityPaths?: Set<string> } = {}) {
	const folder = { name: "World", path: "World", children: [] } satisfies FakeFolder;
	const metadataFile = file("World.md", "World/World.md", folder);
	const imageFile = file("World.png", "World/World.png", folder);
	const files = new Map<string, FakeFile | FakeFolder>([
		[metadataFile.path, metadataFile],
		[imageFile.path, imageFile],
	]);
	const frontmatter = new Map<string, Record<string, unknown>>();

	for (const mapPin of pins) {
		if (!options.missingEntityPaths?.has(mapPin.entityPath)) {
			const entity = file(mapPin.entityPath.split("/").pop() ?? mapPin.entityPath, mapPin.entityPath, folder);
			files.set(entity.path, entity);
			frontmatter.set(entity.path, {});
		}
	}

	return {
		folder,
		files,
		frontmatter,
		pins,
		fileContents: new Map<string, string>(),
		createdContent: new Map<string, string>(),
		modifiedContent: new Map<string, string>(),
		map: {
			folder: folder as never,
			folderPath: "World",
			name: "World",
			metadataFile: metadataFile as never,
			imageFile: imageFile as never,
		} satisfies ResolvedMap,
		resolveTarget(target: string) {
			if (files.has(target)) {
				return files.get(target) as FakeFile;
			}
			const basename = target.split("/").pop()?.replace(/\.md$/i, "") ?? target;
			return [...files.values()].find((candidate): candidate is FakeFile => {
				return isFakeFile(candidate) && candidate.basename === basename;
			}) ?? null;
		},
	};
}

function pin(type: string, name: string, entityPath: string): MapPin {
	return {
		id: `world__${type}__${name.toLowerCase().replace(/\s+/g, "_")}`,
		name,
		link: `[[${name}]]`,
		entityPath,
		type,
		x: 0.5,
		y: 0.5,
	};
}

interface FakeFolder {
	name: string;
	path: string;
	children: Array<FakeFile | FakeFolder>;
}

interface FakeFile {
	name: string;
	basename: string;
	extension: string;
	path: string;
	parent: FakeFolder;
}

function file(name: string, path: string, parent: FakeFolder): FakeFile {
	const extensionStart = name.lastIndexOf(".");
	const extension = extensionStart === -1 ? "" : name.slice(extensionStart + 1);
	const basename = extensionStart === -1 ? name : name.slice(0, extensionStart);
	const created = { name, basename, extension, path, parent };
	parent.children.push(created);
	return created;
}

function isFakeFile(value: FakeFile | FakeFolder): value is FakeFile {
	return "extension" in value;
}
