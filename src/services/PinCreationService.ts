import type { TAbstractFile, TFile, Vault } from "obsidian";
import type { NormalizedPoint } from "./MapCoordinateService";
import {
	buildEntityNoteContent,
	buildEntityWikiLink,
	buildParentLocationNoteContent,
} from "./EntityNoteService";
import {
	buildEntityPath,
	ensureVaultFolderPath,
} from "./EntityFolderService";
import {
	appendPinToMapFrontmatter,
	assertCanAppendPinToMapFrontmatter,
	type FrontmatterWriter,
} from "./MapPinWriteService";
import { normalizePinMetadata, readHierarchyTarget, type PinMetadataInput } from "./PinMetadataService";
import { generatePinId } from "./PinIdService";
import { isPinType, type PinType } from "./PinTypeService";
import { SELECTED_TEMPLATE_NOT_FOUND_MESSAGE } from "./TemplateService";
import type { ParentLocationCreationMode } from "../settings";
import type { MapMetadata, MapPin, ResolvedMap } from "../types";

type PinCreationVault = Pick<Vault, "create" | "createFolder" | "getAbstractFileByPath">;

export interface ParentLocationCreationConfirmation {
	name: string;
	path: string;
}

export interface PinCreationDependencies {
	vault: PinCreationVault;
	fileManager: FrontmatterWriter;
	loadMetadata(file: TFile): MapMetadata;
	loadRawFrontmatter(file: TFile): unknown;
	readTemplate?(templatePath: string): Promise<string>;
	confirmParentLocationCreation?(input: ParentLocationCreationConfirmation): Promise<boolean>;
}

export interface CreatePinRequest extends PinMetadataInput {
	map: ResolvedMap;
	name: string;
	type: string;
	point: NormalizedPoint;
	entityFolderPath?: string;
	locationFolderPath?: string;
	templatePath?: string;
	parentLocationCreation?: ParentLocationCreationMode;
}

export interface CreatePinResult {
	pin: MapPin;
	entityFile: TFile;
	createdEntity: boolean;
}

export class PinCreationService {
	constructor(private readonly dependencies: PinCreationDependencies) {
	}

	async createPin(request: CreatePinRequest): Promise<CreatePinResult> {
		const type = readPinType(request.type);
		const normalizedPoint = readNormalizedPoint(request.point);
		const entityPathResult = buildEntityPath(request.entityFolderPath ?? request.map.folderPath, request.name);

		if (!entityPathResult) {
			throw new Error("Pin name must produce a valid filename.");
		}

		const pinMetadata = normalizePinMetadata(type, request);
		const metadata = this.dependencies.loadMetadata(request.map.metadataFile);
		const pinId = generatePinId({
			mapName: request.map.name,
			type,
			entityBasename: entityPathResult.basename,
			existingIds: new Set(metadata.pins.map((pin) => pin.id)),
		});
		assertCanAppendPinToMapFrontmatter(
			this.dependencies.loadRawFrontmatter(request.map.metadataFile),
			pinId,
		);
		await ensureVaultFolderPath(this.dependencies.vault, request.entityFolderPath ?? request.map.folderPath);
		const entityPath = entityPathResult.entityPath;
		const existingEntity = this.dependencies.vault.getAbstractFileByPath(entityPath);
		let entityFile: TFile;
		let createdEntity = false;

		if (existingEntity && !isFile(existingEntity)) {
			throw new Error(`Target path exists but is not a markdown file: ${entityPath}`);
		}

		const bodyTemplate = !existingEntity && request.templatePath
			? await this.readSelectedTemplate(request.templatePath)
			: undefined;

		await this.maybeCreateParentLocationNote({
			parentLocation: pinMetadata.parentLocation,
			locationFolderPath: request.locationFolderPath ?? request.entityFolderPath ?? request.map.folderPath,
			mode: request.parentLocationCreation ?? "never",
		});

		if (existingEntity) {
			entityFile = existingEntity;
		} else {
			entityFile = await this.dependencies.vault.create(
				entityPath,
				buildEntityNoteContent({
					displayName: entityPathResult.displayName,
					mapName: request.map.name,
					mapPath: request.map.metadataFile.path,
					pinId,
					type,
					...pinMetadata,
					x: normalizedPoint.x,
					y: normalizedPoint.y,
					bodyTemplate,
				}),
			);
			createdEntity = true;
		}

		const pin: MapPin = {
			id: pinId,
			name: entityPathResult.displayName,
			link: buildEntityWikiLink(entityPathResult.basename, entityPathResult.displayName),
			entityPath,
			type,
			...pinMetadata,
			x: normalizedPoint.x,
			y: normalizedPoint.y,
		};

		await appendPinToMapFrontmatter(
			this.dependencies.fileManager,
			request.map.metadataFile,
			pin,
		);

		return {
			pin,
			entityFile,
			createdEntity,
		};
	}

	private async readSelectedTemplate(templatePath: string): Promise<string> {
		if (!this.dependencies.readTemplate) {
			throw new Error(SELECTED_TEMPLATE_NOT_FOUND_MESSAGE);
		}

		try {
			return await this.dependencies.readTemplate(templatePath);
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}

			throw new Error("Unable to read selected template.");
		}
	}

	private async maybeCreateParentLocationNote(input: {
		parentLocation: string | undefined;
		locationFolderPath: string;
		mode: ParentLocationCreationMode;
	}): Promise<void> {
		if (!input.parentLocation || input.mode === "never") {
			return;
		}

		const parentName = readHierarchyTarget(input.parentLocation);
		if (parentName && isFolderQualifiedTarget(parentName)) {
			throw new Error(`Parent location target must be a note name, not a folder path: ${parentName}`);
		}

		const parentPathResult = parentName ? buildEntityPath(input.locationFolderPath, parentName) : null;

		if (!parentPathResult) {
			throw new Error("Parent location name must produce a valid filename.");
		}

		const existingParent = this.dependencies.vault.getAbstractFileByPath(parentPathResult.entityPath);

		if (existingParent) {
			if (!isFile(existingParent)) {
				throw new Error(`Target path exists but is not a markdown file: ${parentPathResult.entityPath}`);
			}

			return;
		}

		if (input.mode === "ask") {
			const confirmed = await this.dependencies.confirmParentLocationCreation?.({
				name: parentPathResult.displayName,
				path: parentPathResult.entityPath,
			});

			if (!confirmed) {
				return;
			}
		}

		await ensureVaultFolderPath(this.dependencies.vault, input.locationFolderPath);
		await this.dependencies.vault.create(
			parentPathResult.entityPath,
			buildParentLocationNoteContent(parentPathResult.displayName),
		);
	}
}

function readPinType(type: string): PinType {
	if (!isPinType(type)) {
		throw new Error("Pin type is not supported.");
	}

	return type;
}

function readNormalizedPoint(point: NormalizedPoint): NormalizedPoint {
	if (!isNormalizedCoordinate(point.x) || !isNormalizedCoordinate(point.y)) {
		throw new Error("Pin coordinates must be normalized values from 0 to 1.");
	}

	return point;
}

function isNormalizedCoordinate(value: number): boolean {
	return Number.isFinite(value) && value >= 0 && value <= 1;
}

function isFolderQualifiedTarget(value: string): boolean {
	return value.includes("/") || value.includes("\\");
}

function isFile(file: TAbstractFile): file is TFile {
	const maybeFile = file as { basename?: unknown; extension?: unknown } | null;
	return !!maybeFile
		&& typeof maybeFile.basename === "string"
		&& typeof maybeFile.extension === "string"
		&& maybeFile.extension.toLowerCase() === "md";
}
