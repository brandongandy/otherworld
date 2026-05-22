import type { TFile } from "obsidian";
import type { MapPin } from "../types";

export interface FrontmatterWriter {
	processFrontMatter(
		file: TFile,
		callback: (frontmatter: Record<string, unknown>) => void,
	): Promise<void>;
}

export const MAP_PIN_NOT_FOUND_MESSAGE = "Map pin could not be found.";

export function assertCanAppendPinToMapFrontmatter(frontmatter: unknown, pinId: string): void {
	const frontmatterRecord = isRecord(frontmatter) ? frontmatter : {};
	const existingMap = frontmatterRecord.worldbuildingMap;

	if (existingMap === undefined) {
		return;
	}

	if (!isRecord(existingMap)) {
		throw new Error("worldbuildingMap must be an object.");
	}

	const pins = existingMap.pins;

	if (pins === undefined) {
		return;
	}

	if (!Array.isArray(pins)) {
		throw new Error("worldbuildingMap.pins must be an array.");
	}

	if (pins.some((existingPin) => hasPinId(existingPin, pinId))) {
		throw new Error(`worldbuildingMap.pins already contains pin id: ${pinId}`);
	}
}

export async function appendPinToMapFrontmatter(
	writer: FrontmatterWriter,
	mapFile: TFile,
	pin: MapPin,
): Promise<void> {
	await writer.processFrontMatter(mapFile, (frontmatter) => {
		assertCanAppendPinToMapFrontmatter(frontmatter, pin.id);
		const existingMap = frontmatter.worldbuildingMap;

		if (existingMap === undefined) {
			frontmatter.worldbuildingMap = {
				pins: [pin],
			};
			return;
		}

		if (!isRecord(existingMap)) {
			throw new Error("worldbuildingMap must be an object.");
		}

		const pins = existingMap.pins;

		if (pins === undefined) {
			existingMap.pins = [pin];
			return;
		}

		if (!Array.isArray(pins)) {
			throw new Error("worldbuildingMap.pins must be an array.");
		}

		pins.push(pin);
	});
}

export async function replacePinInMapFrontmatter(
	writer: FrontmatterWriter,
	mapFile: TFile,
	pinId: string,
	updatedPin: MapPin,
): Promise<void> {
	await writer.processFrontMatter(mapFile, (frontmatter) => {
		const pins = readWritablePins(frontmatter);
		const pinIndex = pins.findIndex((existingPin) => hasPinId(existingPin, pinId));

		if (pinIndex === -1) {
			throw new Error(MAP_PIN_NOT_FOUND_MESSAGE);
		}

		pins[pinIndex] = { ...updatedPin, id: pinId };
	});
}

function readWritablePins(frontmatter: Record<string, unknown>): unknown[] {
	const existingMap = frontmatter.worldbuildingMap;

	if (!isRecord(existingMap)) {
		throw new Error("worldbuildingMap must be an object.");
	}

	const pins = existingMap.pins;

	if (!Array.isArray(pins)) {
		throw new Error("worldbuildingMap.pins must be an array.");
	}

	return pins;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasPinId(value: unknown, pinId: string): boolean {
	return isRecord(value) && value.id === pinId;
}
