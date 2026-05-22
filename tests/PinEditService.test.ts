import { describe, expect, it, vi } from "vitest";
import {
	ENTITY_METADATA_UPDATE_FAILED_MESSAGE,
	LINKED_ENTITY_NOT_FOUND_MESSAGE,
	MAP_PIN_NOT_FOUND_MESSAGE,
	PinEditService,
} from "../src/services/PinEditService";
import type { MapPin, ResolvedMap } from "../src/types";

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

const originalPin: MapPin = {
	id: "world__location__aldmere",
	name: "Aldmere",
	link: "[[Aldmere]]",
	entityPath: "World/Aldmere.md",
	type: "location",
	subtype: "city",
	parentLocation: "[[Northern Marches]]",
	x: 0.421,
	y: 0.337,
};

describe("PinEditService", () => {
	it("exports the map pin not found message", () => {
		expect(MAP_PIN_NOT_FOUND_MESSAGE).toBe("Map pin could not be found.");
	});

	it("updates map metadata and linked entity frontmatter", async () => {
		const context = createMapContext([originalPin]);
		const entity = file("Aldmere.md", "World/Aldmere.md", context.folder);
		context.files.set(entity.path, entity);
		context.entityFrontmatter = {
			type: "location",
			subtype: "city",
			parentLocation: "[[Northern Marches]]",
			unrelated: "preserved",
			maps: [
				{
					map: "[[World]]",
					mapPath: "World/World.md",
					pinId: "world__location__aldmere",
					x: 0.421,
					y: 0.337,
				},
			],
		};
		const { service } = createService(context);

		const result = await service.editPin({
			map: context.map,
			pin: originalPin,
			name: "Aldmere Crossing",
			type: "location",
			subtype: "town",
			parentLocation: "Western Road",
			region: "Northern Marches",
			nation: "Valoria",
			x: 0.5,
			y: 0.25,
		});

		expect(result).toEqual({
			pin: {
				id: "world__location__aldmere",
				name: "Aldmere Crossing",
				link: "[[Aldmere]]",
				entityPath: "World/Aldmere.md",
				type: "location",
				subtype: "town",
				parentLocation: "[[Western Road]]",
				region: "[[Northern Marches]]",
				nation: "[[Valoria]]",
				x: 0.5,
				y: 0.25,
			},
			entityMetadataUpdated: true,
		});
		expect((context.mapFrontmatter.worldbuildingMap as { pins: MapPin[] }).pins).toEqual([result.pin]);
		expect(context.entityFrontmatter).toEqual({
			type: "location",
			subtype: "town",
			parentLocation: "[[Western Road]]",
			region: "[[Northern Marches]]",
			nation: "[[Valoria]]",
			unrelated: "preserved",
			maps: [
				{
					map: "[[World]]",
					mapPath: "World/World.md",
					pinId: "world__location__aldmere",
					x: 0.5,
					y: 0.25,
				},
			],
		});
	});

	it("clears location hierarchy fields when changing to a non-location type", async () => {
		const context = createMapContext([originalPin]);
		const entity = file("Aldmere.md", "World/Aldmere.md", context.folder);
		context.files.set(entity.path, entity);
		context.entityFrontmatter = {
			type: "location",
			subtype: "city",
			parentLocation: "[[Northern Marches]]",
			region: "[[Northern Marches]]",
			nation: "[[Valoria]]",
			maps: [],
		};
		const { service } = createService(context);

		const result = await service.editPin({
			map: context.map,
			pin: originalPin,
			name: "Battle of Aldmere",
			type: "event",
			subtype: "battle",
			x: 0.4,
			y: 0.6,
		});

		expect(result.pin).toEqual({
			id: "world__location__aldmere",
			name: "Battle of Aldmere",
			link: "[[Aldmere]]",
			entityPath: "World/Aldmere.md",
			type: "event",
			subtype: "battle",
			x: 0.4,
			y: 0.6,
		});
		expect(context.entityFrontmatter).toEqual({
			type: "event",
			subtype: "battle",
			maps: [
				{
					map: "[[World]]",
					mapPath: "World/World.md",
					pinId: "world__location__aldmere",
					x: 0.4,
					y: 0.6,
				},
			],
		});
	});

	it("adds a missing matching map reference to entity frontmatter", async () => {
		const context = createMapContext([originalPin]);
		const entity = file("Aldmere.md", "World/Aldmere.md", context.folder);
		context.files.set(entity.path, entity);
		context.entityFrontmatter = {
			type: "location",
			maps: [
				{
					map: "[[Other Map]]",
					mapPath: "Other/Other.md",
					pinId: "other__location__aldmere",
					x: 0.1,
					y: 0.2,
				},
			],
		};
		const { service } = createService(context);

		await service.editPin({
			map: context.map,
			pin: originalPin,
			name: "Aldmere",
			type: "location",
			x: 0.7,
			y: 0.8,
		});

		expect(context.entityFrontmatter.maps).toEqual([
			{
				map: "[[Other Map]]",
				mapPath: "Other/Other.md",
				pinId: "other__location__aldmere",
				x: 0.1,
				y: 0.2,
			},
			{
				map: "[[World]]",
				mapPath: "World/World.md",
				pinId: "world__location__aldmere",
				x: 0.7,
				y: 0.8,
			},
		]);
	});

	it("updates map metadata and returns a warning when the linked entity note is missing", async () => {
		const context = createMapContext([originalPin]);
		const { service } = createService(context);

		const result = await service.editPin({
			map: context.map,
			pin: originalPin,
			name: "Aldmere Crossing",
			type: "location",
			x: 0.5,
			y: 0.25,
		});

		expect(result.entityMetadataUpdated).toBe(false);
		expect(result.warning).toBe(LINKED_ENTITY_NOT_FOUND_MESSAGE);
		expect((context.mapFrontmatter.worldbuildingMap as { pins: MapPin[] }).pins[0]).toMatchObject({
			name: "Aldmere Crossing",
			x: 0.5,
			y: 0.25,
		});
	});

	it("updates map metadata and returns a warning when entity metadata cannot be written", async () => {
		const context = createMapContext([originalPin]);
		const entity = file("Aldmere.md", "World/Aldmere.md", context.folder);
		context.files.set(entity.path, entity);
		context.failEntityFrontmatter = true;
		const { service } = createService(context);

		const result = await service.editPin({
			map: context.map,
			pin: originalPin,
			name: "Aldmere Crossing",
			type: "location",
			x: 0.5,
			y: 0.25,
		});

		expect(result.entityMetadataUpdated).toBe(false);
		expect(result.warning).toBe(ENTITY_METADATA_UPDATE_FAILED_MESSAGE);
		expect((context.mapFrontmatter.worldbuildingMap as { pins: MapPin[] }).pins[0]).toMatchObject({
			name: "Aldmere Crossing",
			x: 0.5,
			y: 0.25,
		});
	});

	it("rejects invalid edit input before writing", async () => {
		const context = createMapContext([originalPin]);
		const { service, fileManager } = createService(context);

		await expectExactRejectionMessage(() => service.editPin({
			map: context.map,
			pin: originalPin,
			name: " ",
			type: "location",
			x: 0.5,
			y: 0.25,
		}), "Enter a pin name.");

		await expectExactRejectionMessage(() => service.editPin({
			map: context.map,
			pin: originalPin,
			name: "Aldmere",
			type: "planet",
			x: 0.5,
			y: 0.25,
		}), "Pin type is not supported.");

		await expectExactRejectionMessage(() => service.editPin({
			map: context.map,
			pin: originalPin,
			name: "Aldmere",
			type: "event",
			subtype: "city",
			x: 0.5,
			y: 0.25,
		}), "Pin subtype is not supported for the selected type.");

		await expectExactRejectionMessage(() => service.editPin({
			map: context.map,
			pin: originalPin,
			name: "Aldmere",
			type: "location",
			x: -0.1,
			y: 0.25,
		}), "Pin coordinates must be normalized values from 0 to 1.");

		expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
	});
});

function createMapContext(existingPins: MapPin[]) {
	const folder = { name: "World", path: "World", children: [] } satisfies FakeFolder;
	const metadataFile = file("World.md", "World/World.md", folder);
	const imageFile = file("World.png", "World/World.png", folder);
	const files = new Map<string, FakeFile | FakeFolder>([
		[metadataFile.path, metadataFile],
		[imageFile.path, imageFile],
	]);

	return {
		folder,
		files,
		map: {
			folder: folder as never,
			folderPath: "World",
			name: "World",
			metadataFile: metadataFile as never,
			imageFile: imageFile as never,
		} satisfies ResolvedMap,
		mapFrontmatter: {
			worldbuildingMap: {
				image: "World.png",
				coordinateSystem: "normalizedImage",
				pins: existingPins.map((pin) => ({ ...pin })),
			},
		} as Record<string, unknown>,
		entityFrontmatter: {} as Record<string, unknown>,
		failEntityFrontmatter: false,
	};
}

function createService(context: ReturnType<typeof createMapContext>) {
	const vault = {
		getAbstractFileByPath: vi.fn((path: string) => context.files.get(path) ?? null),
	};
	const fileManager = {
		processFrontMatter: vi.fn(async (fileArg: FakeFile, callback: (frontmatter: Record<string, unknown>) => void) => {
			if (fileArg.path === context.map.metadataFile.path) {
				callback(context.mapFrontmatter);
				return;
			}

			if (context.failEntityFrontmatter) {
				throw new Error("Disk full.");
			}

			callback(context.entityFrontmatter);
		}),
	};

	return {
		service: new PinEditService({
			vault,
			fileManager,
		}),
		vault,
		fileManager,
	};
}

function file(name: string, path: string, parent: FakeFolder): FakeFile {
	const extensionStart = name.lastIndexOf(".");
	const extension = extensionStart === -1 ? "" : name.slice(extensionStart + 1);
	const basename = extensionStart === -1 ? name : name.slice(0, extensionStart);
	const created = { name, basename, extension, path, parent };
	parent.children.push(created);
	return created;
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
