import type { TAbstractFile, Vault } from "obsidian";
import { normalizeVaultFolderPath } from "../settings";
import { sanitizeEntityFileName } from "./FileNameService";

type EntityFolderVault = Pick<Vault, "createFolder" | "getAbstractFileByPath">;

export interface BuiltEntityPath {
	displayName: string;
	basename: string;
	entityPath: string;
}

export function buildEntityPath(folderPath: string, entityName: string): BuiltEntityPath | null {
	const sanitized = sanitizeEntityFileName(entityName);

	if (!sanitized) {
		return null;
	}

	const normalizedFolderPath = normalizeVaultFolderPath(folderPath);
	if (!isSafeVaultFolderPath(normalizedFolderPath)) {
		return null;
	}

	return {
		displayName: sanitized.displayName,
		basename: sanitized.basename,
		entityPath: joinVaultPath(normalizedFolderPath, sanitized.fileName),
	};
}

export async function ensureVaultFolderPath(vault: EntityFolderVault, folderPath: string): Promise<void> {
	const normalizedFolderPath = normalizeVaultFolderPath(folderPath);

	if (!normalizedFolderPath) {
		return;
	}

	if (!isSafeVaultFolderPath(normalizedFolderPath)) {
		throw new Error(`Configured output folder path contains unsafe segments: ${normalizedFolderPath}`);
	}

	let currentPath = "";
	for (const segment of normalizedFolderPath.split("/")) {
		currentPath = joinVaultPath(currentPath, segment);
		const existing = vault.getAbstractFileByPath(currentPath);

		if (existing) {
			if (!isFolder(existing)) {
				throw new Error(`Configured output folder path exists but is not a folder: ${currentPath}`);
			}

			continue;
		}

		await vault.createFolder(currentPath);
	}
}

export function joinVaultPath(folderPath: string, childName: string): string {
	return folderPath ? `${folderPath}/${childName}` : childName;
}

function isFolder(file: TAbstractFile): boolean {
	const maybeFolder = file as { children?: unknown } | null;
	return Array.isArray(maybeFolder?.children);
}

function isSafeVaultFolderPath(folderPath: string): boolean {
	return folderPath.split("/").every((segment) => segment !== "." && segment !== "..");
}
