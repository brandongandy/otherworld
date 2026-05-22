import { describe, expect, it, vi } from "vitest";
import { PinCreationService } from "../src/services/PinCreationService";
import type { MapMetadata, ResolvedMap } from "../src/types";

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

function file(name: string, path: string, parent: FakeFolder): FakeFile {
	const extensionStart = name.lastIndexOf(".");
	const extension = extensionStart === -1 ? "" : name.slice(extensionStart + 1);
	const basename = extensionStart === -1 ? name : name.slice(0, extensionStart);
	const created = { name, basename, extension, path, parent };
	parent.children.push(created);
	return created;
}

function createMap(existingPins: MapMetadata["pins"] = []): {
	map: ResolvedMap;
	metadata: MapMetadata;
	frontmatter: Record<string, unknown>;
	vaultFiles: Map<string, FakeFile | FakeFolder>;
} {
	const world = folder("World", "World");
	const metadataFile = file("World.md", "World/World.md", world);
	const imageFile = file("World.png", "World/World.png", world);
	const vaultFiles = new Map([[metadataFile.path, metadataFile], [imageFile.path, imageFile]]);

	return {
		map: {
			folder: world as never,
			folderPath: "World",
			name: "World",
			metadataFile: metadataFile as never,
			imageFile: imageFile as never,
		},
		metadata: {
			pins: existingPins,
		},
		frontmatter: {
			worldbuildingMap: {
				image: "World.png",
				coordinateSystem: "normalizedImage",
				pins: [...existingPins],
			},
		},
		vaultFiles,
	};
}

function createService(
	context: ReturnType<typeof createMap>,
	options: {
		readTemplate?: (templatePath: string) => Promise<string>;
		confirmParentLocationCreation?: (input: { name: string; path: string }) => Promise<boolean>;
	} = {},
) {
	const vault = {
		getAbstractFileByPath: vi.fn((path: string) => context.vaultFiles.get(path) ?? null),
		createFolder: vi.fn(async (path: string) => {
			const name = path.split("/").pop() ?? path;
			const created = folder(name, path);
			context.vaultFiles.set(path, created);
		}),
		create: vi.fn(async (path: string, content: string) => {
			const parent = context.map.folder as unknown as FakeFolder;
			const name = path.split("/").pop() ?? path;
			const created = file(name, path, parent);
			context.vaultFiles.set(path, created);
			createdContent.set(path, content);
			return created;
		}),
	};
	const createdContent = new Map<string, string>();
	const fileManager = {
		processFrontMatter: vi.fn(async (_file, callback: (frontmatter: Record<string, unknown>) => void) => {
			callback(context.frontmatter);
		}),
	};

	return {
		service: new PinCreationService({
			vault,
			fileManager,
			loadMetadata: () => context.metadata,
			loadRawFrontmatter: () => context.frontmatter,
			readTemplate: options.readTemplate,
			confirmParentLocationCreation: options.confirmParentLocationCreation,
		}),
		vault,
		fileManager,
		createdContent,
	};
}

async function expectExactRejectionMessage(action: () => Promise<unknown>, message: string): Promise<void> {
	try {
		await action();
	} catch (error) {
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe(message);
		return;
	}

	throw new Error("Expected action to reject.");
}

describe("PinCreationService", () => {
	it("creates a missing entity note and appends a map pin", async () => {
		const context = createMap();
		const { service, vault, createdContent } = createService(context);

		const result = await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			point: { x: 0.421, y: 0.337 },
		});

		expect(result.createdEntity).toBe(true);
		expect(result.pin).toEqual({
			id: "world__location__aldmere",
			name: "Aldmere",
			link: "[[Aldmere]]",
			entityPath: "World/Aldmere.md",
			type: "location",
			x: 0.421,
			y: 0.337,
		});
		expect(vault.create).toHaveBeenCalledWith("World/Aldmere.md", createdContent.get("World/Aldmere.md"));
		expect(createdContent.get("World/Aldmere.md")).toContain("pinId: world__location__aldmere");
		expect(context.frontmatter.worldbuildingMap).toMatchObject({
			image: "World.png",
			coordinateSystem: "normalizedImage",
		});
		expect((context.frontmatter.worldbuildingMap as { pins: unknown[] }).pins).toContainEqual(result.pin);
	});

	it("links an existing entity note without overwriting it", async () => {
		const context = createMap();
		const existing = file("Aldmere.md", "World/Aldmere.md", context.map.folder as never);
		context.vaultFiles.set(existing.path, existing);
		const { service, vault } = createService(context);

		const result = await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			point: { x: 0.5, y: 0.25 },
		});

		expect(result.createdEntity).toBe(false);
		expect(result.entityFile).toBe(existing);
		expect(vault.create).not.toHaveBeenCalled();
		expect((context.frontmatter.worldbuildingMap as { pins: unknown[] }).pins).toContainEqual(result.pin);
	});

	it("rejects a non-markdown target path before writing", async () => {
		const context = createMap();
		const targetFolder = folder("Aldmere.md", "World/Aldmere.md");
		context.vaultFiles.set(targetFolder.path, targetFolder);
		const { service, vault, fileManager } = createService(context);

		await expectExactRejectionMessage(() => service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			point: { x: 0.5, y: 0.25 },
		}), "Target path exists but is not a markdown file: World/Aldmere.md");

		expect(vault.create).not.toHaveBeenCalled();
		expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("creates root-folder entity paths without a leading slash", async () => {
		const context = createMap();
		context.map.folderPath = "";
		const { service, vault } = createService(context);

		const result = await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			point: { x: 0.5, y: 0.25 },
		});

		expect(result.pin.entityPath).toBe("Aldmere.md");
		expect(vault.create).toHaveBeenCalledWith("Aldmere.md", expect.any(String));
	});

	it("creates entity notes in the configured folder for the pin type", async () => {
		const context = createMap();
		const { service, vault, createdContent } = createService(context);

		const result = await service.createPin({
			map: context.map,
			name: "Battle of Red Ford",
			type: "event",
			entityFolderPath: "Events",
			point: { x: 0.512, y: 0.691 },
		});

		expect(result.pin.entityPath).toBe("Events/Battle of Red Ford.md");
		expect(vault.createFolder).toHaveBeenCalledWith("Events");
		expect(vault.create).toHaveBeenCalledWith("Events/Battle of Red Ford.md", createdContent.get("Events/Battle of Red Ford.md"));
	});

	it("creates entity notes at the vault root when configured folder is blank", async () => {
		const context = createMap();
		const { service, vault } = createService(context);

		const result = await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			entityFolderPath: "",
			point: { x: 0.5, y: 0.25 },
		});

		expect(result.pin.entityPath).toBe("Aldmere.md");
		expect(vault.createFolder).not.toHaveBeenCalled();
		expect(vault.create).toHaveBeenCalledWith("Aldmere.md", expect.any(String));
	});

	it("fails before writing map metadata when the configured folder path conflicts with a file", async () => {
		const context = createMap();
		const conflict = file("Locations.md", "Locations", context.map.folder as never);
		context.vaultFiles.set(conflict.path, conflict);
		const { service, vault, fileManager } = createService(context);

		await expectExactRejectionMessage(() => service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			entityFolderPath: "Locations",
			point: { x: 0.5, y: 0.25 },
		}), "Configured output folder path exists but is not a folder: Locations");

		expect(vault.create).not.toHaveBeenCalled();
		expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("creates a new entity note with a selected template body", async () => {
		const context = createMap();
		const readTemplate = vi.fn(async () => [
			"# {{name}}",
			"",
			"Type: {{type}}",
			"Subtype: {{subtype}}",
			"Map: {{map}}",
			"Parent: {{parentLocation}}",
		].join("\n"));
		const { service, createdContent } = createService(context, { readTemplate });

		await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			subtype: "city",
			parentLocation: "Northern Marches",
			templatePath: "Templates/Location.md",
			point: { x: 0.421, y: 0.337 },
		});

		expect(readTemplate).toHaveBeenCalledWith("Templates/Location.md");
		expect(createdContent.get("World/Aldmere.md")).toContain([
			"# Aldmere",
			"",
			"Type: location",
			"Subtype: city",
			"Map: World",
			"Parent: [[Northern Marches]]",
		].join("\n"));
	});

	it("uses the default fallback body when no template is selected", async () => {
		const context = createMap();
		const readTemplate = vi.fn();
		const { service, createdContent } = createService(context, { readTemplate });

		await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			point: { x: 0.421, y: 0.337 },
		});

		expect(readTemplate).not.toHaveBeenCalled();
		expect(createdContent.get("World/Aldmere.md")).toContain([
			"# Aldmere",
			"",
			"## Description",
			"",
			"## Notes",
		].join("\n"));
	});

	it("does not read or apply templates when linking an existing entity note", async () => {
		const context = createMap();
		const existing = file("Aldmere.md", "World/Aldmere.md", context.map.folder as never);
		context.vaultFiles.set(existing.path, existing);
		const readTemplate = vi.fn(async () => "# {{name}}");
		const { service, vault, createdContent } = createService(context, { readTemplate });

		const result = await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			templatePath: "Templates/Location.md",
			point: { x: 0.421, y: 0.337 },
		});

		expect(result.createdEntity).toBe(false);
		expect(result.entityFile).toBe(existing);
		expect(readTemplate).not.toHaveBeenCalled();
		expect(vault.create).not.toHaveBeenCalled();
		expect(createdContent.size).toBe(0);
	});

	it("rejects missing selected templates before writing", async () => {
		const context = createMap();
		const readTemplate = vi.fn(async () => {
			throw new Error("Selected template file was not found.");
		});
		const { service, vault, fileManager } = createService(context, { readTemplate });

		await expectExactRejectionMessage(() => service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			templatePath: "Templates/Missing.md",
			point: { x: 0.421, y: 0.337 },
		}), "Selected template file was not found.");

		expect(vault.create).not.toHaveBeenCalled();
		expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("rejects duplicate live pin ids when loaded metadata is stale", async () => {
		const context = createMap();
		const existing = file("Aldmere.md", "World/Aldmere.md", context.map.folder as never);
		context.vaultFiles.set(existing.path, existing);
		const duplicatePin = {
			id: "world__location__aldmere",
			name: "Aldmere",
			link: "[[Aldmere]]",
			entityPath: "World/Aldmere.md",
			type: "location",
			x: 0.1,
			y: 0.2,
		};
		(context.frontmatter.worldbuildingMap as { pins: unknown[] }).pins = [duplicatePin];
		const originalFrontmatter = JSON.parse(JSON.stringify(context.frontmatter));
		const { service, vault } = createService(context);

		await expectExactRejectionMessage(() => service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			point: { x: 0.5, y: 0.25 },
		}), "worldbuildingMap.pins already contains pin id: world__location__aldmere");

		expect(vault.create).not.toHaveBeenCalled();
		expect(context.frontmatter).toEqual(originalFrontmatter);
	});

	it("rejects malformed map frontmatter before creating an entity note", async () => {
		const context = createMap();
		context.frontmatter = { worldbuildingMap: "bad" };
		const { service, vault, fileManager } = createService(context);

		await expectExactRejectionMessage(() => service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			point: { x: 0.5, y: 0.25 },
		}), "worldbuildingMap must be an object.");

		expect(vault.create).not.toHaveBeenCalled();
		expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		expect(context.frontmatter).toEqual({ worldbuildingMap: "bad" });
	});

	it("creates a location pin with subtype and hierarchy metadata", async () => {
		const context = createMap();
		const { service, createdContent } = createService(context);

		const result = await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			subtype: "city",
			parentLocation: " Northern   Marches ",
			region: "[[Northern Marches]]",
			nation: "Valoria",
			point: { x: 0.421, y: 0.337 },
		});

		expect(result.pin).toMatchObject({
			type: "location",
			subtype: "city",
			parentLocation: "[[Northern Marches]]",
			region: "[[Northern Marches]]",
			nation: "[[Valoria]]",
		});
		expect(createdContent.get("World/Aldmere.md")).toContain("subtype: city");
		expect(createdContent.get("World/Aldmere.md")).toContain("parentLocation: \"[[Northern Marches]]\"");
		expect(createdContent.get("World/Aldmere.md")).toContain("region: \"[[Northern Marches]]\"");
		expect(createdContent.get("World/Aldmere.md")).toContain("nation: \"[[Valoria]]\"");
		expect((context.frontmatter.worldbuildingMap as { pins: unknown[] }).pins).toContainEqual(result.pin);
	});

	it("does not create missing parent notes when parent creation mode is never", async () => {
		const context = createMap();
		const { service, vault } = createService(context);

		const result = await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			subtype: "city",
			parentLocation: "Northern Marches",
			entityFolderPath: "Locations",
			locationFolderPath: "Locations",
			parentLocationCreation: "never",
			point: { x: 0.421, y: 0.337 },
		});

		expect(result.pin.parentLocation).toBe("[[Northern Marches]]");
		expect(vault.create).not.toHaveBeenCalledWith("Locations/Northern Marches.md", expect.any(String));
	});

	it("creates missing parent notes when parent creation mode is always", async () => {
		const context = createMap();
		const { service, vault, createdContent } = createService(context);

		await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			subtype: "city",
			parentLocation: "Northern Marches",
			entityFolderPath: "Locations",
			locationFolderPath: "Locations",
			parentLocationCreation: "always",
			point: { x: 0.421, y: 0.337 },
		});

		expect(vault.create).toHaveBeenCalledWith("Locations/Northern Marches.md", createdContent.get("Locations/Northern Marches.md"));
		expect(createdContent.get("Locations/Northern Marches.md")).toBe([
			"---",
			"type: location",
			"subtype: region",
			"---",
			"",
			"# Northern Marches",
			"",
			"## Description",
			"",
			"## Notes",
			"",
		].join("\n"));
	});

	it("creates parent notes from aliased parent wikilink targets", async () => {
		const context = createMap();
		const { service, vault, createdContent } = createService(context);

		await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			parentLocation: "[[Northern Marches|the Marches]]",
			entityFolderPath: "Locations",
			locationFolderPath: "Locations",
			parentLocationCreation: "always",
			point: { x: 0.421, y: 0.337 },
		});

		expect(vault.create).toHaveBeenCalledWith("Locations/Northern Marches.md", createdContent.get("Locations/Northern Marches.md"));
		expect(vault.create).not.toHaveBeenCalledWith("Locations/Northern Marches the Marches.md", expect.any(String));
	});

	it("rejects folder-qualified parent targets before creating parent notes or writing map metadata", async () => {
		const context = createMap();
		const { service, vault, fileManager } = createService(context);

		await expectExactRejectionMessage(() => service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			parentLocation: "[[Regions/Northern Marches|the Marches]]",
			entityFolderPath: "Locations",
			locationFolderPath: "Locations",
			parentLocationCreation: "always",
			point: { x: 0.421, y: 0.337 },
		}), "Parent location target must be a note name, not a folder path: Regions/Northern Marches");

		expect(vault.create).not.toHaveBeenCalledWith("Locations/Regions Northern Marches.md", expect.any(String));
		expect(vault.create).not.toHaveBeenCalledWith("Locations/Aldmere.md", expect.any(String));
		expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("preserves folder-qualified parent metadata when parent creation mode is never", async () => {
		const context = createMap();
		const { service, createdContent } = createService(context);

		const result = await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			parentLocation: "[[Regions/Northern Marches|the Marches]]",
			entityFolderPath: "Locations",
			locationFolderPath: "Locations",
			parentLocationCreation: "never",
			point: { x: 0.421, y: 0.337 },
		});

		expect(result.pin.parentLocation).toBe("[[Regions/Northern Marches|the Marches]]");
		expect(createdContent.get("Locations/Aldmere.md")).toContain("parentLocation: \"[[Regions/Northern Marches|the Marches]]\"");
		expect((context.frontmatter.worldbuildingMap as { pins: unknown[] }).pins).toContainEqual(result.pin);
	});

	it("asks before creating missing parent notes in ask mode", async () => {
		const context = createMap();
		const confirmParentLocationCreation = vi.fn(async () => true);
		const { service } = createService(context, { confirmParentLocationCreation });

		await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			parentLocation: "Northern Marches",
			entityFolderPath: "Locations",
			locationFolderPath: "Locations",
			parentLocationCreation: "ask",
			point: { x: 0.421, y: 0.337 },
		});

		expect(confirmParentLocationCreation).toHaveBeenCalledWith({
			name: "Northern Marches",
			path: "Locations/Northern Marches.md",
		});
	});

	it("continues pin creation when parent creation is canceled in ask mode", async () => {
		const context = createMap();
		const confirmParentLocationCreation = vi.fn(async () => false);
		const { service, vault } = createService(context, { confirmParentLocationCreation });

		const result = await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			parentLocation: "Northern Marches",
			entityFolderPath: "Locations",
			locationFolderPath: "Locations",
			parentLocationCreation: "ask",
			point: { x: 0.421, y: 0.337 },
		});

		expect(result.pin.parentLocation).toBe("[[Northern Marches]]");
		expect(vault.create).not.toHaveBeenCalledWith("Locations/Northern Marches.md", expect.any(String));
		expect((context.frontmatter.worldbuildingMap as { pins: unknown[] }).pins).toContainEqual(result.pin);
	});

	it("continues pin creation without creating parent notes in ask mode when confirmation is unavailable", async () => {
		const context = createMap();
		const { service, vault } = createService(context);

		const result = await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			parentLocation: "Northern Marches",
			entityFolderPath: "Locations",
			locationFolderPath: "Locations",
			parentLocationCreation: "ask",
			point: { x: 0.421, y: 0.337 },
		});

		expect(result.pin.parentLocation).toBe("[[Northern Marches]]");
		expect(vault.create).not.toHaveBeenCalledWith("Locations/Northern Marches.md", expect.any(String));
		expect((context.frontmatter.worldbuildingMap as { pins: unknown[] }).pins).toContainEqual(result.pin);
	});

	it("does not overwrite existing parent location markdown notes", async () => {
		const context = createMap();
		const parent = file("Northern Marches.md", "Locations/Northern Marches.md", context.map.folder as never);
		context.vaultFiles.set(parent.path, parent);
		const { service, vault } = createService(context);

		await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			parentLocation: "Northern Marches",
			entityFolderPath: "Locations",
			locationFolderPath: "Locations",
			parentLocationCreation: "always",
			point: { x: 0.421, y: 0.337 },
		});

		expect(vault.create).not.toHaveBeenCalledWith("Locations/Northern Marches.md", expect.any(String));
	});

	it("rejects parent paths that exist as non-markdown files before writing map metadata", async () => {
		const context = createMap();
		const parentFolder = folder("Northern Marches.md", "Locations/Northern Marches.md");
		context.vaultFiles.set(parentFolder.path, parentFolder);
		const { service, vault, fileManager } = createService(context);

		await expectExactRejectionMessage(() => service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			parentLocation: "Northern Marches",
			entityFolderPath: "Locations",
			locationFolderPath: "Locations",
			parentLocationCreation: "always",
			point: { x: 0.421, y: 0.337 },
		}), "Target path exists but is not a markdown file: Locations/Northern Marches.md");

		expect(vault.create).not.toHaveBeenCalled();
		expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("stops pin creation before writing map metadata when parent note creation fails", async () => {
		const context = createMap();
		const { service, vault, fileManager } = createService(context);
		vault.create.mockImplementationOnce(async () => {
			throw new Error("Unable to create parent note.");
		});

		await expectExactRejectionMessage(() => service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			parentLocation: "Northern Marches",
			entityFolderPath: "Locations",
			locationFolderPath: "Locations",
			parentLocationCreation: "always",
			point: { x: 0.421, y: 0.337 },
		}), "Unable to create parent note.");

		expect(vault.create).toHaveBeenCalledWith("Locations/Northern Marches.md", expect.any(String));
		expect(vault.create).not.toHaveBeenCalledWith("Locations/Aldmere.md", expect.any(String));
		expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("creates a non-location pin with subtype metadata", async () => {
		const context = createMap();
		const { service, createdContent } = createService(context);

		const result = await service.createPin({
			map: context.map,
			name: "Battle of Red Ford",
			type: "event",
			subtype: "battle",
			point: { x: 0.512, y: 0.691 },
		});

		expect(result.pin).toMatchObject({
			type: "event",
			subtype: "battle",
		});
		expect(result.pin).not.toHaveProperty("parentLocation");
		expect(createdContent.get("World/Battle of Red Ford.md")).toContain("type: event");
		expect(createdContent.get("World/Battle of Red Ford.md")).toContain("subtype: battle");
		expect(createdContent.get("World/Battle of Red Ford.md")).not.toContain("parentLocation");
	});

	it("links an existing note while keeping enriched metadata on the map pin only", async () => {
		const context = createMap();
		const existing = file("Aldmere.md", "World/Aldmere.md", context.map.folder as never);
		context.vaultFiles.set(existing.path, existing);
		const { service, vault, createdContent } = createService(context);

		const result = await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			subtype: "city",
			parentLocation: "Northern Marches",
			nation: "Valoria",
			point: { x: 0.5, y: 0.25 },
		});

		expect(result.createdEntity).toBe(false);
		expect(result.entityFile).toBe(existing);
		expect(vault.create).not.toHaveBeenCalled();
		expect(createdContent.size).toBe(0);
		expect(result.pin).toMatchObject({
			subtype: "city",
			parentLocation: "[[Northern Marches]]",
			nation: "[[Valoria]]",
		});
		expect((context.frontmatter.worldbuildingMap as { pins: unknown[] }).pins).toContainEqual(result.pin);
	});

	it("rejects invalid metadata before writing", async () => {
		const context = createMap();
		const { service, vault, fileManager } = createService(context);

		await expectExactRejectionMessage(() => service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "event",
			subtype: "city",
			point: { x: 0.5, y: 0.25 },
		}), "Pin subtype is not supported for the selected type.");

		await expectExactRejectionMessage(() => service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "event",
			subtype: "battle",
			parentLocation: "Northern Marches",
			point: { x: 0.5, y: 0.25 },
		}), "Location hierarchy fields are only supported for location pins.");

		expect(vault.create).not.toHaveBeenCalled();
		expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("uses collision suffixes for duplicate pin ids", async () => {
		const context = createMap([
			{
				id: "world__location__aldmere",
				name: "Aldmere",
				link: "[[Aldmere]]",
				entityPath: "World/Aldmere.md",
				type: "location",
				x: 0.1,
				y: 0.2,
			},
		]);
		const { service } = createService(context);

		const result = await service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			point: { x: 0.5, y: 0.25 },
		});

		expect(result.pin.id).toBe("world__location__aldmere_2");
	});

	it("rejects invalid creation input before writing", async () => {
		const context = createMap();
		const { service, vault, fileManager } = createService(context);

		await expectExactRejectionMessage(() => service.createPin({
			map: context.map,
			name: "???",
			type: "location",
			point: { x: 0.5, y: 0.25 },
		}), "Pin name must produce a valid filename.");

		await expectExactRejectionMessage(() => service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "planet",
			point: { x: 0.5, y: 0.25 },
		}), "Pin type is not supported.");

		await expectExactRejectionMessage(() => service.createPin({
			map: context.map,
			name: "Aldmere",
			type: "location",
			point: { x: 1.5, y: 0.25 },
		}), "Pin coordinates must be normalized values from 0 to 1.");

		expect(vault.create).not.toHaveBeenCalled();
		expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
	});
});
