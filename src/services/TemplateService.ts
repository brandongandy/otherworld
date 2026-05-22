import type { TFile, Vault } from "obsidian";

export const SELECTED_TEMPLATE_NOT_FOUND_MESSAGE = "Selected template file was not found.";

export const DEFAULT_ENTITY_NOTE_BODY = [
	"# {{name}}",
	"",
	"## Description",
	"",
	"## Notes",
].join("\n");

export interface TemplateOption {
	path: string;
	name: string;
}

export interface TemplateRenderContext {
	name: string;
	type: string;
	subtype?: string;
	map: string;
	mapPath: string;
	x: number;
	y: number;
	pinId: string;
	parentLocation?: string;
	nation?: string;
	region?: string;
}

interface TemplateApp {
	vault: Pick<Vault, "getAbstractFileByPath" | "read">;
	internalPlugins?: unknown;
}

interface FolderLike {
	children: unknown[];
}

interface FileLike extends TFile {
	basename: string;
	extension: string;
	path: string;
}

export class TemplateService {
	constructor(private readonly app: TemplateApp) {
	}

	listTemplateOptions(): TemplateOption[] {
		const folderPath = readTemplatesFolderPath(this.app);

		if (!folderPath) {
			return [];
		}

		const folder = this.app.vault.getAbstractFileByPath(folderPath);

		if (!isFolderLike(folder)) {
			return [];
		}

		return collectMarkdownTemplates(folder)
			.map((file) => ({
				path: file.path,
				name: file.basename,
			}))
			.sort(compareTemplateOptions);
	}

	async readTemplate(templatePath: string): Promise<string> {
		const templateFile = this.app.vault.getAbstractFileByPath(templatePath);

		if (!isMarkdownFileLike(templateFile)) {
			throw new Error(SELECTED_TEMPLATE_NOT_FOUND_MESSAGE);
		}

		return this.app.vault.read(templateFile);
	}
}

export function renderTemplateContent(template: string, context: TemplateRenderContext): string {
	const values: Record<string, string> = {
		name: context.name,
		type: context.type,
		subtype: context.subtype ?? "",
		map: context.map,
		mapPath: context.mapPath,
		x: String(context.x),
		y: String(context.y),
		pinId: context.pinId,
		parentLocation: context.parentLocation ?? "",
		nation: context.nation ?? "",
		region: context.region ?? "",
	};

	return template.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (match, token: string) => {
		const value = values[token];
		return value === undefined ? match : value;
	});
}

function compareTemplateOptions(left: TemplateOption, right: TemplateOption): number {
	const baseNameComparison = left.name.localeCompare(right.name, undefined, {
		sensitivity: "base",
	});

	if (baseNameComparison !== 0) {
		return baseNameComparison;
	}

	const exactNameComparison = left.name.localeCompare(right.name);

	if (exactNameComparison !== 0) {
		return exactNameComparison;
	}

	return left.path.localeCompare(right.path);
}

function collectMarkdownTemplates(folder: FolderLike): FileLike[] {
	const templates: FileLike[] = [];

	for (const child of folder.children) {
		if (isMarkdownFileLike(child)) {
			templates.push(child);
			continue;
		}

		if (isFolderLike(child)) {
			templates.push(...collectMarkdownTemplates(child));
		}
	}

	return templates;
}

function readTemplatesFolderPath(app: TemplateApp): string | undefined {
	const appRecord = isRecord(app) ? app : undefined;
	const internalPlugins = readRecord(appRecord?.internalPlugins);
	const plugins = readRecord(internalPlugins?.plugins);
	const templates = readRecord(plugins?.templates);

	if (templates?.enabled === false) {
		return undefined;
	}

	const instance = readRecord(templates?.instance);
	const options = readRecord(instance?.options);
	const folder = options?.folder;

	return typeof folder === "string" && folder.trim() ? folder.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
	return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFolderLike(file: unknown): file is FolderLike {
	return !!file && typeof file === "object" && Array.isArray((file as FolderLike).children);
}

function isMarkdownFileLike(file: unknown): file is FileLike {
	const maybeFile = file as Partial<FileLike> | null;
	return !!maybeFile
		&& typeof maybeFile.basename === "string"
		&& typeof maybeFile.extension === "string"
		&& typeof maybeFile.path === "string"
		&& maybeFile.extension.toLowerCase() === "md";
}
