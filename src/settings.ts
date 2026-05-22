import { sanitizeEntityFileName } from "./services/FileNameService";
import { getPinSubtypes } from "./services/PinSubtypeService";
import { PIN_TYPES, type PinType } from "./services/PinTypeService";

export const PARENT_LOCATION_CREATION_MODES = [
	"never",
	"ask",
	"always",
] as const;

export type ParentLocationCreationMode = typeof PARENT_LOCATION_CREATION_MODES[number];

export type PinTypeRecord<T> = Record<PinType, T>;

export interface OtherworldSettings {
	autoCreateMapMetadataOnImageOpen: boolean;
	entityFolders: PinTypeRecord<string>;
	defaultSubtypes: PinTypeRecord<string>;
	showPinLabelsByDefault: boolean;
	parentLocationCreation: ParentLocationCreationMode;
	indexFilenamePattern: string;
}

export const DEFAULT_SETTINGS: OtherworldSettings = {
	autoCreateMapMetadataOnImageOpen: false,
	entityFolders: {
		location: "Locations",
		event: "Events",
		person: "People",
		faction: "Factions",
		item: "Items",
	},
	defaultSubtypes: {
		location: "city",
		event: "historical",
		person: "other",
		faction: "other",
		item: "other",
	},
	showPinLabelsByDefault: true,
	parentLocationCreation: "ask",
	indexFilenamePattern: "{{mapName}} Index",
};

export function mergeSettings(savedData: unknown): OtherworldSettings {
	const savedRecord = isRecord(savedData) ? savedData : {};

	return {
		autoCreateMapMetadataOnImageOpen: readBoolean(
			savedRecord.autoCreateMapMetadataOnImageOpen,
			DEFAULT_SETTINGS.autoCreateMapMetadataOnImageOpen,
		),
		entityFolders: readEntityFolders(savedRecord.entityFolders),
		defaultSubtypes: readDefaultSubtypes(savedRecord.defaultSubtypes),
		showPinLabelsByDefault: readBoolean(
			savedRecord.showPinLabelsByDefault,
			DEFAULT_SETTINGS.showPinLabelsByDefault,
		),
		parentLocationCreation: readParentLocationCreationMode(savedRecord.parentLocationCreation),
		indexFilenamePattern: readIndexFilenamePattern(savedRecord.indexFilenamePattern),
	};
}

export function normalizeVaultFolderPath(value: string): string {
	return value
		.trim()
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

export function renderIndexFilenameBase(pattern: string, mapName: string): string | null {
	const rendered = pattern.replace(/\{\{mapName\}\}/g, mapName);
	const sanitized = sanitizeEntityFileName(rendered);
	return sanitized?.basename ?? null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function readEntityFolders(value: unknown): PinTypeRecord<string> {
	const record = isRecord(value) ? value : {};
	const folders = { ...DEFAULT_SETTINGS.entityFolders };

	for (const type of PIN_TYPES) {
		if (typeof record[type] === "string") {
			const folder = normalizeVaultFolderPath(record[type]);
			if (isSafeVaultFolderPath(folder)) {
				folders[type] = folder;
			}
		}
	}

	return folders;
}

function isSafeVaultFolderPath(value: string): boolean {
	return value === "" || value.split("/").every((segment) => segment !== "." && segment !== "..");
}

function readDefaultSubtypes(value: unknown): PinTypeRecord<string> {
	const record = isRecord(value) ? value : {};
	const subtypes = { ...DEFAULT_SETTINGS.defaultSubtypes };

	for (const type of PIN_TYPES) {
		if (typeof record[type] !== "string") {
			continue;
		}

		const subtype = record[type].trim();
		if (!subtype || getPinSubtypes(type).includes(subtype)) {
			subtypes[type] = subtype;
		}
	}

	return subtypes;
}

function readParentLocationCreationMode(value: unknown): ParentLocationCreationMode {
	return PARENT_LOCATION_CREATION_MODES.includes(value as ParentLocationCreationMode)
		? value as ParentLocationCreationMode
		: DEFAULT_SETTINGS.parentLocationCreation;
}

function readIndexFilenamePattern(value: unknown): string {
	if (typeof value !== "string") {
		return DEFAULT_SETTINGS.indexFilenamePattern;
	}

	const pattern = value.trim();
	return renderIndexFilenameBase(pattern, "World")
		? pattern
		: DEFAULT_SETTINGS.indexFilenamePattern;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
