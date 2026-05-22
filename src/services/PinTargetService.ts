import type { App, TFile } from "obsidian";
import { readWikiLinkTarget } from "./WikiLinkService";

interface PinTargetDeps {
	vault: {
		getAbstractFileByPath(path: string): unknown;
	};
	metadataCache: {
		getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
	};
}

export class PinTargetService {
	constructor(private readonly app: App) {
	}

	resolve(target: string, sourcePath: string): TFile | null {
		return resolvePinTarget(this.app, target, sourcePath);
	}
}

export function resolvePinTarget(
	deps: PinTargetDeps,
	target: string,
	sourcePath: string,
): TFile | null {
	const exactTarget = deps.vault.getAbstractFileByPath(target);

	if (isFile(exactTarget)) {
		return exactTarget;
	}

	return deps.metadataCache.getFirstLinkpathDest(readWikiLinkTarget(target), sourcePath);
}

function isFile(file: unknown): file is TFile {
	const maybeFile = file as { basename?: unknown; extension?: unknown } | null;
	return !!maybeFile
		&& typeof maybeFile.basename === "string"
		&& typeof maybeFile.extension === "string";
}
