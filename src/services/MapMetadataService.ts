import type { App, TFile } from "obsidian";
import type { MapMetadata, MapPin } from "../types";

type UnknownRecord = Record<string, unknown>;

export class MapMetadataService {
	constructor(private readonly app: App) {
	}

	loadMetadata(file: TFile): MapMetadata {
		return parseMapMetadata(this.loadRawFrontmatter(file));
	}

	loadRawFrontmatter(file: TFile): unknown {
		return this.app.metadataCache.getFileCache(file)?.frontmatter;
	}
}

export function parseMapMetadata(frontmatter: unknown): MapMetadata {
	const record = asRecord(frontmatter);
	const mapRecord = asRecord(record?.worldbuildingMap);
	const pinsValue = mapRecord?.pins;

	if (!Array.isArray(pinsValue)) {
		return { pins: [] };
	}

	return {
		pins: pinsValue
			.map(parsePin)
			.filter((pin): pin is MapPin => pin !== null),
	};
}

function parsePin(value: unknown): MapPin | null {
	const record = asRecord(value);

	if (!record) {
		return null;
	}

	const id = readString(record.id);
	const name = readString(record.name);
	const link = readString(record.link);
	const entityPath = readString(record.entityPath);
	const x = readCoordinate(record.x);
	const y = readCoordinate(record.y);

	if (!id || !name || !link || !entityPath || x === null || y === null) {
		return null;
	}

	const pin: MapPin = { id, name, link, entityPath, x, y };
	const type = readString(record.type);
	const subtype = readString(record.subtype);
	const parentLocation = readString(record.parentLocation);
	const nation = readString(record.nation);
	const region = readString(record.region);

	if (type) {
		pin.type = type;
	}

	if (subtype) {
		pin.subtype = subtype;
	}

	if (parentLocation) {
		pin.parentLocation = parentLocation;
	}

	if (nation) {
		pin.nation = nation;
	}

	if (region) {
		pin.region = region;
	}

	return pin;
}

function asRecord(value: unknown): UnknownRecord | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}

	return value as UnknownRecord;
}

function readString(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function readCoordinate(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}

	return value >= 0 && value <= 1 ? value : null;
}
