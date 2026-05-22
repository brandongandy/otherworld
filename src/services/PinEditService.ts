import type { TAbstractFile, TFile, Vault } from "obsidian";
import {
	MAP_PIN_NOT_FOUND_MESSAGE,
	replacePinInMapFrontmatter,
	type FrontmatterWriter,
} from "./MapPinWriteService";
import { normalizeOptionalText, normalizePinMetadata, type PinMetadataInput } from "./PinMetadataService";
import { isPinType, type PinType } from "./PinTypeService";
import type { MapPin, ResolvedMap } from "../types";

type PinEditVault = Pick<Vault, "getAbstractFileByPath">;

export const LINKED_ENTITY_NOT_FOUND_MESSAGE = "Updated pin, but linked note was not found.";
export const ENTITY_METADATA_UPDATE_FAILED_MESSAGE = "Updated pin, but linked note metadata could not be updated.";

export interface PinEditDependencies {
	vault: PinEditVault;
	fileManager: FrontmatterWriter;
}

export interface EditPinRequest extends PinMetadataInput {
	map: ResolvedMap;
	pin: MapPin;
	name: string;
	type: string;
	x: number;
	y: number;
}

export interface EditPinResult {
	pin: MapPin;
	entityMetadataUpdated: boolean;
	warning?: string;
}

export class PinEditService {
	constructor(private readonly dependencies: PinEditDependencies) {
	}

	async editPin(request: EditPinRequest): Promise<EditPinResult> {
		const name = readDisplayName(request.name);
		const type = readPinType(request.type);
		const point = readNormalizedPoint(request.x, request.y);
		const metadata = normalizePinMetadata(type, request);
		const updatedPin: MapPin = {
			id: request.pin.id,
			name,
			link: request.pin.link,
			entityPath: request.pin.entityPath,
			type,
			...metadata,
			x: point.x,
			y: point.y,
		};

		await replacePinInMapFrontmatter(
			this.dependencies.fileManager,
			request.map.metadataFile,
			request.pin.id,
			updatedPin,
		);

		const entityFile = this.dependencies.vault.getAbstractFileByPath(request.pin.entityPath);

		if (!isMarkdownFile(entityFile)) {
			return {
				pin: updatedPin,
				entityMetadataUpdated: false,
				warning: LINKED_ENTITY_NOT_FOUND_MESSAGE,
			};
		}

		try {
			await this.dependencies.fileManager.processFrontMatter(entityFile, (frontmatter) => {
				syncEntityFrontmatter(frontmatter, request.map, updatedPin, type);
			});
		} catch {
			return {
				pin: updatedPin,
				entityMetadataUpdated: false,
				warning: ENTITY_METADATA_UPDATE_FAILED_MESSAGE,
			};
		}

		return {
			pin: updatedPin,
			entityMetadataUpdated: true,
		};
	}
}

export function syncEntityFrontmatter(
	frontmatter: Record<string, unknown>,
	map: ResolvedMap,
	pin: MapPin,
	type: PinType,
): void {
	frontmatter.type = type;
	writeOptionalFrontmatter(frontmatter, "subtype", pin.subtype);

	if (type === "location") {
		writeOptionalFrontmatter(frontmatter, "parentLocation", pin.parentLocation);
		writeOptionalFrontmatter(frontmatter, "region", pin.region);
		writeOptionalFrontmatter(frontmatter, "nation", pin.nation);
	} else {
		delete frontmatter.parentLocation;
		delete frontmatter.region;
		delete frontmatter.nation;
	}

	const maps = Array.isArray(frontmatter.maps) ? frontmatter.maps : [];
	const mapEntry = findOrCreateMapEntry(maps, map, pin);
	mapEntry.map = `[[${map.name}]]`;
	mapEntry.mapPath = map.metadataFile.path;
	mapEntry.pinId = pin.id;
	mapEntry.x = pin.x;
	mapEntry.y = pin.y;
	frontmatter.maps = maps;
}

function findOrCreateMapEntry(
	maps: unknown[],
	map: ResolvedMap,
	pin: MapPin,
): Record<string, unknown> {
	const existing = maps.find((entry): entry is Record<string, unknown> => {
		return isRecord(entry)
			&& entry.mapPath === map.metadataFile.path
			&& entry.pinId === pin.id;
	});

	if (existing) {
		return existing;
	}

	const created: Record<string, unknown> = {};
	maps.push(created);
	return created;
}

function readDisplayName(name: string): string {
	const normalized = normalizeOptionalText(name);

	if (!normalized) {
		throw new Error("Enter a pin name.");
	}

	return normalized;
}

function readPinType(type: string): PinType {
	if (!isPinType(type)) {
		throw new Error("Pin type is not supported.");
	}

	return type;
}

function readNormalizedPoint(x: number, y: number): { x: number; y: number } {
	if (!isNormalizedCoordinate(x) || !isNormalizedCoordinate(y)) {
		throw new Error("Pin coordinates must be normalized values from 0 to 1.");
	}

	return { x, y };
}

function isNormalizedCoordinate(value: number): boolean {
	return Number.isFinite(value) && value >= 0 && value <= 1;
}

function writeOptionalFrontmatter(
	frontmatter: Record<string, unknown>,
	key: string,
	value: string | undefined,
): void {
	if (value) {
		frontmatter[key] = value;
		return;
	}

	delete frontmatter[key];
}

function isMarkdownFile(file: TAbstractFile | null): file is TFile {
	const maybeFile = file as { basename?: unknown; extension?: unknown } | null;
	return !!maybeFile
		&& typeof maybeFile.basename === "string"
		&& typeof maybeFile.extension === "string"
		&& maybeFile.extension.toLowerCase() === "md";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

export { MAP_PIN_NOT_FOUND_MESSAGE };
