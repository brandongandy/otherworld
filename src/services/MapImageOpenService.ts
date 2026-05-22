import type { TFile, TFolder, Vault } from "obsidian";
import {
	SUPPORTED_IMAGE_EXTENSIONS,
	type SupportedImageExtension,
} from "../types";

type MetadataVault = Pick<Vault, "create" | "getAbstractFileByPath">;

export function isSameNameSupportedMapImage(file: TFile | null): file is TFile {
	if (!isFile(file) || !isFolder(file.parent)) {
		return false;
	}

	return file.basename === file.parent.name
		&& SUPPORTED_IMAGE_EXTENSIONS.includes(file.extension.toLowerCase() as SupportedImageExtension);
}

export function getMapMetadataPathForImage(file: TFile): string {
	const folderPath = file.parent?.path ?? "";
	const metadataName = `${file.basename}.md`;
	return folderPath ? `${folderPath}/${metadataName}` : metadataName;
}

export function buildInitialMapMetadataContent(folderName: string, imageName: string): string {
	return [
		"---",
		"worldbuildingMap:",
		`  image: ${formatYamlScalar(imageName)}`,
		"  coordinateSystem: normalizedImage",
		"  pins: []",
		"---",
		"",
		`# ${folderName}`,
		"",
	].join("\n");
}

export async function createMapMetadataForImage(
	vault: MetadataVault,
	imageFile: TFile,
): Promise<TFile> {
	const metadataPath = getMapMetadataPathForImage(imageFile);
	const existingMetadata = vault.getAbstractFileByPath(metadataPath);

	if (isFile(existingMetadata)) {
		return existingMetadata;
	}

	return vault.create(
		metadataPath,
		buildInitialMapMetadataContent(imageFile.parent?.name ?? imageFile.basename, imageFile.name),
	);
}

function isFile(file: unknown): file is TFile {
	const maybeFile = file as { basename?: unknown; extension?: unknown } | null;
	return !!maybeFile
		&& typeof maybeFile.basename === "string"
		&& typeof maybeFile.extension === "string";
}

function isFolder(file: unknown): file is TFolder {
	return !!file && Array.isArray((file as { children?: unknown }).children);
}

function formatYamlScalar(value: string): string {
	if (canUsePlainYamlScalar(value)) {
		return value;
	}

	return `'${value.replace(/'/g, "''")}'`;
}

function canUsePlainYamlScalar(value: string): boolean {
	return value.length > 0
		&& value.trim() === value
		&& !/^[?-]/.test(value)
		&& !/[#[\]{},:&*!"'|>%@`:]/.test(value);
}
