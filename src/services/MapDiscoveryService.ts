import type { TAbstractFile, TFile, TFolder, Vault } from "obsidian";
import {
	SUPPORTED_IMAGE_EXTENSIONS,
	type ResolvedMap,
} from "../types";

type VaultLookup = Pick<Vault, "getAbstractFileByPath">;

export class MapDiscoveryService {
	constructor(private readonly vault: VaultLookup) {
	}

	resolveFromAbstractFile(file: TAbstractFile | null): ResolvedMap | null {
		if (!file) {
			return null;
		}

		if (isFolder(file)) {
			return this.resolveFromFolder(file);
		}

		return this.resolveFromFile(file as TFile);
	}

	resolveFromFile(file: TFile | null): ResolvedMap | null {
		return this.resolveFromFolder(file?.parent ?? null);
	}

	resolveFromFolderPath(folderPath: string): ResolvedMap | null {
		const folder = this.vault.getAbstractFileByPath(normalizeVaultPath(folderPath));

		if (!isFolder(folder)) {
			return null;
		}

		return this.resolveFromFolder(folder);
	}

	resolveFromFolder(folder: TFolder | null): ResolvedMap | null {
		let current = folder;

		while (current && current.name) {
			const resolved = this.resolveAtFolder(current);

			if (resolved) {
				return resolved;
			}

			current = current.parent;
		}

		return null;
	}

	private resolveAtFolder(folder: TFolder): ResolvedMap | null {
		const name = folder.name;
		const metadataPath = joinVaultPath(folder.path, `${name}.md`);
		const metadataFile = this.vault.getAbstractFileByPath(metadataPath);

		if (!isFile(metadataFile) || metadataFile.extension.toLowerCase() !== "md") {
			return null;
		}

		const imageFile = this.findImageFile(folder, name);

		if (!imageFile) {
			return null;
		}

		return {
			folder,
			folderPath: folder.path,
			name,
			metadataFile,
			imageFile,
		};
	}

	private findImageFile(folder: TFolder, basename: string): TFile | null {
		for (const extension of SUPPORTED_IMAGE_EXTENSIONS) {
			for (const child of folder.children) {
				if (isFile(child) && child.basename === basename && child.extension.toLowerCase() === extension) {
					return child;
				}
			}
		}

		return null;
	}
}

function isFolder(file: TAbstractFile | null): file is TFolder {
	return !!file && Array.isArray((file as { children?: unknown }).children);
}

function isFile(file: TAbstractFile | null): file is TFile {
	const maybeFile = file as { basename?: unknown; extension?: unknown } | null;
	return !!maybeFile
		&& typeof maybeFile.basename === "string"
		&& typeof maybeFile.extension === "string";
}

function joinVaultPath(folderPath: string, childName: string): string {
	return folderPath ? `${folderPath}/${childName}` : childName;
}

function normalizeVaultPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}
