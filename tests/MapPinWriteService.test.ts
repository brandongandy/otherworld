import { describe, expect, it, vi } from "vitest";
import {
	MAP_PIN_NOT_FOUND_MESSAGE,
	appendPinToMapFrontmatter,
	replacePinInMapFrontmatter,
} from "../src/services/MapPinWriteService";
import type { MapPin } from "../src/types";

const pin: MapPin = {
	id: "world__location__aldmere",
	name: "Aldmere",
	link: "[[Aldmere]]",
	entityPath: "World/Aldmere.md",
	type: "location",
	x: 0.421,
	y: 0.337,
};

function fileManager(frontmatter: Record<string, unknown>) {
	const manager = {
		callbackThrew: false,
		processFrontMatter: vi.fn(async (_file, callback: (frontmatter: Record<string, unknown>) => void) => {
			try {
				callback(frontmatter);
			} catch (error) {
				manager.callbackThrew = true;
				throw error;
			}
		}),
	};

	return manager;
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

describe("appendPinToMapFrontmatter", () => {
	it("appends a pin and preserves existing map metadata", async () => {
		const frontmatter = {
			worldbuildingMap: {
				image: "World.png",
				coordinateSystem: "normalizedImage",
				pins: [
					{
						id: "existing",
						name: "Existing",
						link: "[[Existing]]",
						entityPath: "World/Existing.md",
						x: 0.1,
						y: 0.2,
					},
				],
			},
			other: "value",
		};
		const manager = fileManager(frontmatter);

		await appendPinToMapFrontmatter(manager, {} as never, pin);

		expect(frontmatter).toEqual({
			worldbuildingMap: {
				image: "World.png",
				coordinateSystem: "normalizedImage",
				pins: [
					{
						id: "existing",
						name: "Existing",
						link: "[[Existing]]",
						entityPath: "World/Existing.md",
						x: 0.1,
						y: 0.2,
					},
					pin,
				],
			},
			other: "value",
		});
	});

	it("initializes missing worldbuildingMap and pins", async () => {
		const frontmatter = {};
		const manager = fileManager(frontmatter);

		await appendPinToMapFrontmatter(manager, {} as never, pin);

		expect(frontmatter).toEqual({
			worldbuildingMap: {
				pins: [pin],
			},
		});
	});

	it("initializes missing pins on existing map metadata", async () => {
		const frontmatter = {
			worldbuildingMap: {
				image: "World.png",
				coordinateSystem: "normalizedImage",
			},
		};
		const manager = fileManager(frontmatter);

		await appendPinToMapFrontmatter(manager, {} as never, pin);

		expect(frontmatter).toEqual({
			worldbuildingMap: {
				image: "World.png",
				coordinateSystem: "normalizedImage",
				pins: [pin],
			},
		});
	});

	it("rejects non-object worldbuildingMap metadata", async () => {
		const frontmatter = { worldbuildingMap: "bad" };
		const manager = fileManager(frontmatter);

		await expect(appendPinToMapFrontmatter(manager, {} as never, pin))
			.rejects.toThrow("worldbuildingMap must be an object.");
		expect(manager.callbackThrew).toBe(true);
		expect(frontmatter).toEqual({ worldbuildingMap: "bad" });
	});

	it("rejects non-array pins metadata", async () => {
		const frontmatter = { worldbuildingMap: { pins: "bad" } };
		const manager = fileManager(frontmatter);

		await expect(appendPinToMapFrontmatter(manager, {} as never, pin))
			.rejects.toThrow("worldbuildingMap.pins must be an array.");
		expect(manager.callbackThrew).toBe(true);
		expect(frontmatter).toEqual({ worldbuildingMap: { pins: "bad" } });
	});

	it("rejects duplicate live pin ids inside the frontmatter callback", async () => {
		const frontmatter = {
			worldbuildingMap: {
				pins: [
					{
						id: "world__location__aldmere",
						name: "Existing Aldmere",
						link: "[[Existing Aldmere]]",
						entityPath: "World/Existing Aldmere.md",
						x: 0.1,
						y: 0.2,
					},
				],
			},
		};
		const originalFrontmatter = JSON.parse(JSON.stringify(frontmatter));
		const manager = fileManager(frontmatter);

		await expectExactRejectionMessage(
			() => appendPinToMapFrontmatter(manager, {} as never, pin),
			"worldbuildingMap.pins already contains pin id: world__location__aldmere",
		);

		expect(manager.callbackThrew).toBe(true);
		expect(frontmatter).toEqual(originalFrontmatter);
	});

	describe("replacePinInMapFrontmatter", () => {
		it("replaces one pin by id and preserves map metadata and other pins", async () => {
			const updatedPin: MapPin = {
				...pin,
				name: "Aldmere Crossing",
				subtype: "town",
				parentLocation: "[[Northern Marches]]",
				x: 0.6,
				y: 0.7,
			};
			const otherPin: MapPin = {
				id: "world__event__battle",
				name: "Battle",
				link: "[[Battle]]",
				entityPath: "World/Battle.md",
				type: "event",
				x: 0.2,
				y: 0.3,
			};
			const frontmatter = {
				worldbuildingMap: {
					image: "World.png",
					coordinateSystem: "normalizedImage",
					pins: [pin, otherPin],
				},
				other: "value",
			};
			const manager = fileManager(frontmatter);

			await replacePinInMapFrontmatter(manager, {} as never, pin.id, updatedPin);

			expect(frontmatter).toEqual({
				worldbuildingMap: {
					image: "World.png",
					coordinateSystem: "normalizedImage",
					pins: [updatedPin, otherPin],
				},
				other: "value",
			});
		});

		it("rejects a missing pin id without changing existing pins", async () => {
			const originalFrontmatter = {
				worldbuildingMap: {
					image: "World.png",
					pins: [pin],
				},
			};
			const frontmatter = JSON.parse(JSON.stringify(originalFrontmatter));
			const manager = fileManager(frontmatter);

			await expectExactRejectionMessage(
				() => replacePinInMapFrontmatter(manager, {} as never, "missing", {
					...pin,
					id: "missing",
					name: "Missing",
				}),
				MAP_PIN_NOT_FOUND_MESSAGE,
			);

			expect(manager.callbackThrew).toBe(true);
			expect(frontmatter).toEqual(originalFrontmatter);
		});

		it("preserves the stable id when the replacement pin has a different id", async () => {
			const frontmatter = {
				worldbuildingMap: {
					pins: [pin],
				},
			};
			const manager = fileManager(frontmatter);

			await replacePinInMapFrontmatter(manager, {} as never, pin.id, {
				...pin,
				id: "world__location__renamed",
				name: "Renamed Aldmere",
			});

			expect(frontmatter.worldbuildingMap.pins).toEqual([
				{
					...pin,
					name: "Renamed Aldmere",
				},
			]);
		});

		it("rejects non-object worldbuildingMap metadata when replacing a pin", async () => {
			const frontmatter = { worldbuildingMap: "bad" };
			const manager = fileManager(frontmatter);

			await expectExactRejectionMessage(
				() => replacePinInMapFrontmatter(manager, {} as never, pin.id, pin),
				"worldbuildingMap must be an object.",
			);
			expect(manager.callbackThrew).toBe(true);
			expect(frontmatter).toEqual({ worldbuildingMap: "bad" });
		});

		it("rejects non-array pins metadata when replacing a pin", async () => {
			const frontmatter = { worldbuildingMap: { pins: "bad" } };
			const manager = fileManager(frontmatter);

			await expectExactRejectionMessage(
				() => replacePinInMapFrontmatter(manager, {} as never, pin.id, pin),
				"worldbuildingMap.pins must be an array.",
			);
			expect(manager.callbackThrew).toBe(true);
			expect(frontmatter).toEqual({ worldbuildingMap: { pins: "bad" } });
		});
	});
});
