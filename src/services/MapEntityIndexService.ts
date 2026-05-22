import type { TAbstractFile, TFile, Vault } from "obsidian";
import { DEFAULT_SETTINGS, renderIndexFilenameBase, type OtherworldSettings } from "../settings";
import type { MapMetadata, MapPin, ResolvedMap } from "../types";
import { joinVaultPath } from "./EntityFolderService";
import { LocationHierarchyService, type LocationHierarchyLocation } from "./LocationHierarchyService";
import {
	createEmptyIndexSections,
	mergeIndexDocument,
	renderIndexDocument,
	type IndexSections,
	type IndexWarningGroup,
	type MapIndexNode,
} from "./MapIndexMarkdownService";
import { isPinType, PIN_TYPES, type PinType } from "./PinTypeService";
import { readWikiLinkDisplayText, wikiLinkKey } from "./WikiLinkService";

type IndexVault = Pick<Vault, "create" | "getAbstractFileByPath" | "modify" | "read">;

export interface MapEntityIndexDependencies {
	vault: IndexVault;
	loadMapMetadata(file: TFile): MapMetadata;
	loadFrontmatter(file: TFile): Record<string, unknown> | undefined;
	resolveTarget(target: string, sourcePath: string): TFile | null;
}

export interface GenerateMapEntityIndexRequest {
	map: ResolvedMap;
	settings: OtherworldSettings;
}

export interface MapEntityIndexResult {
	indexPath: string;
	created: boolean;
	counts: Record<PinType, number>;
	warningCounts: {
		missingEntityNotes: number;
		unresolvedParents: number;
		cycles: number;
		duplicateLinks: number;
		unsupportedPins: number;
	};
	notice: string;
}

export class MapEntityIndexService {
	constructor(private readonly dependencies: MapEntityIndexDependencies) {}

	async generateIndex(request: GenerateMapEntityIndexRequest): Promise<MapEntityIndexResult> {
		const metadata = this.dependencies.loadMapMetadata(request.map.metadataFile);
		const grouped = this.groupPins(metadata.pins, request.map.metadataFile.path);
		const indexPath = this.resolveIndexPath(request.map, request.settings);
		assertIndexPathIsSafe(indexPath, request.map, grouped.entityFilePaths);

		const hierarchy = new LocationHierarchyService({
			resolveLink: (target, sourcePath) => {
				const file = this.dependencies.resolveTarget(target, sourcePath);
				if (file) {
					grouped.entityFilePaths.add(file.path);
				}
				return file;
			},
			loadFrontmatter: (file) => this.dependencies.loadFrontmatter(file),
		}).buildHierarchy({
			sourcePath: request.map.metadataFile.path,
			locations: grouped.locations,
		});
		assertIndexPathIsSafe(indexPath, request.map, grouped.entityFilePaths);

		const sections = this.buildSections(grouped, hierarchy.roots);
		const totalDuplicateLinks = grouped.duplicateLinks + hierarchy.duplicateCount;
		const warningGroups = this.buildWarningGroups(grouped, hierarchy.warningGroups, totalDuplicateLinks);
		const title = `${request.map.name} Index`;
		const existingIndex = this.dependencies.vault.getAbstractFileByPath(indexPath);
		let created = false;

		if (isMarkdownFile(existingIndex)) {
			const existingContent = await this.dependencies.vault.read(existingIndex);
			await this.dependencies.vault.modify(existingIndex, mergeIndexDocument(existingContent, {
				title,
				sections,
				warningGroups,
			}));
		} else if (existingIndex) {
			throw new Error(`Index path exists but is not a markdown file: ${indexPath}`);
		} else {
			await this.dependencies.vault.create(indexPath, renderIndexDocument({
				title,
				sections,
				warningGroups,
			}));
			created = true;
		}

		const counts = {
			...grouped.counts,
			location: countNodes(hierarchy.roots),
		};
		const warningCounts = {
			missingEntityNotes: countWarningItems(warningGroups, "Missing entity notes"),
			unresolvedParents: countWarningItems(warningGroups, "Unresolved location parents"),
			cycles: countWarningItems(warningGroups, "Location hierarchy cycles"),
			duplicateLinks: totalDuplicateLinks,
			unsupportedPins: countWarningItems(warningGroups, "Unsupported pin types"),
		};

		return {
			indexPath,
			created,
			counts,
			warningCounts,
			notice: buildNotice(indexPath, counts, warningCounts),
		};
	}

	private groupPins(pins: MapPin[], sourcePath: string): GroupedPins {
		const flatPins: Record<PinType, MapIndexNode[]> = createEmptyIndexSections();
		const counts: Record<PinType, number> = {
			location: 0,
			event: 0,
			person: 0,
			faction: 0,
			item: 0,
		};
		const locations: LocationHierarchyLocation[] = [];
		const seenByType = new Map<PinType, Set<string>>();
		const unsupportedPins: MapPin[] = [];
		const missingEntityWarnings: string[] = [];
		const entityFilePaths = new Set<string>();
		let duplicateLinks = 0;

		for (const pin of pins) {
			const entityFile = this.dependencies.resolveTarget(pin.entityPath, sourcePath)
				?? this.dependencies.resolveTarget(pin.link, sourcePath);
			if (pin.entityPath) {
				entityFilePaths.add(pin.entityPath);
			}
			if (entityFile) {
				entityFilePaths.add(entityFile.path);
			}

			if (!isPinType(pin.type)) {
				unsupportedPins.push(pin);
				continue;
			}

			const seen = seenByType.get(pin.type) ?? new Set<string>();
			seenByType.set(pin.type, seen);
			const key = wikiLinkKey(pin.link);
			if (seen.has(key)) {
				duplicateLinks += 1;
				continue;
			}
			seen.add(key);
			counts[pin.type] += 1;

			if (!entityFile) {
				missingEntityWarnings.push(`${pin.link} points to \`${pin.entityPath}\`, but that file was not found.`);
			}

			if (pin.type === "location") {
				locations.push({
					pin,
					entityFile,
					frontmatter: entityFile ? this.dependencies.loadFrontmatter(entityFile) : undefined,
				});
				continue;
			}

			flatPins[pin.type].push({
				link: pin.link,
				label: pin.name || readWikiLinkDisplayText(pin.link),
				children: [],
			});
		}

		for (const type of PIN_TYPES) {
			flatPins[type].sort(compareNodes);
		}

		return {
			flatPins,
			counts,
			locations,
			missingEntityWarnings,
			unsupportedPins,
			entityFilePaths,
			duplicateLinks,
		};
	}

	private buildSections(grouped: GroupedPins, locationRoots: MapIndexNode[]): IndexSections {
		return {
			...grouped.flatPins,
			location: locationRoots,
		};
	}

	private buildWarningGroups(
		grouped: GroupedPins,
		hierarchyWarnings: IndexWarningGroup[],
		totalDuplicateLinks: number,
	): IndexWarningGroup[] {
		const groups: IndexWarningGroup[] = [
			{
				heading: "Missing entity notes",
				items: grouped.missingEntityWarnings,
			},
			...hierarchyWarnings,
			{
				heading: "Duplicate links",
				items: totalDuplicateLinks > 0 ? [`${totalDuplicateLinks} duplicate link${totalDuplicateLinks === 1 ? "" : "s"} skipped.`] : [],
			},
			{
				heading: "Unsupported pin types",
				items: grouped.unsupportedPins.map((pin) => `${pin.link} has unsupported type \`${String(pin.type)}\`.`),
			},
		];

		return mergeWarningGroups(groups);
	}

	private resolveIndexPath(map: ResolvedMap, settings: OtherworldSettings): string {
		const filenameBase = renderIndexFilenameBase(settings.indexFilenamePattern, map.name)
			?? renderIndexFilenameBase(DEFAULT_SETTINGS.indexFilenamePattern, map.name);

		if (!filenameBase) {
			throw new Error("Index filename pattern must produce a filename.");
		}

		const filename = filenameBase.toLowerCase().endsWith(".md")
			? filenameBase
			: `${filenameBase}.md`;

		return joinVaultPath(map.folderPath, filename);
	}
}

interface GroupedPins {
	flatPins: IndexSections;
	counts: Record<PinType, number>;
	locations: LocationHierarchyLocation[];
	missingEntityWarnings: string[];
	unsupportedPins: MapPin[];
	entityFilePaths: Set<string>;
	duplicateLinks: number;
}

function assertIndexPathIsSafe(indexPath: string, map: ResolvedMap, entityFilePaths: Set<string>): void {
	if (indexPath === map.metadataFile.path || entityFilePaths.has(indexPath)) {
		throw new Error(`Index path would overwrite an existing map or entity note: ${indexPath}`);
	}
}

function countWarningItems(groups: IndexWarningGroup[], heading: string): number {
	return groups.find((group) => group.heading === heading)?.items.length ?? 0;
}

function mergeWarningGroups(groups: IndexWarningGroup[]): IndexWarningGroup[] {
	const merged = new Map<string, string[]>();

	for (const group of groups) {
		for (const item of group.items) {
			const items = merged.get(group.heading) ?? [];
			if (!items.includes(item)) {
				items.push(item);
			}
			merged.set(group.heading, items);
		}
	}

	return [...merged.entries()]
		.filter(([, items]) => items.length > 0)
		.map(([heading, items]) => ({ heading, items }));
}

function buildNotice(
	indexPath: string,
	counts: Record<PinType, number>,
	warnings: MapEntityIndexResult["warningCounts"],
): string {
	const totalEntries = PIN_TYPES.reduce((sum, type) => sum + counts[type], 0);
	const warningParts = [
		warnings.missingEntityNotes ? `${warnings.missingEntityNotes} missing note${warnings.missingEntityNotes === 1 ? "" : "s"}` : "",
		warnings.unresolvedParents ? `${warnings.unresolvedParents} unresolved parent${warnings.unresolvedParents === 1 ? "" : "s"}` : "",
		warnings.cycles ? `${warnings.cycles} cycle${warnings.cycles === 1 ? "" : "s"}` : "",
		warnings.duplicateLinks ? `${warnings.duplicateLinks} duplicate link${warnings.duplicateLinks === 1 ? "" : "s"}` : "",
		warnings.unsupportedPins ? `${warnings.unsupportedPins} unsupported pin${warnings.unsupportedPins === 1 ? "" : "s"}` : "",
	].filter(Boolean);

	return warningParts.length > 0
		? `Generated ${indexPath}: ${totalEntries} indexed entries, ${warningParts.join(", ")}.`
		: `Generated ${indexPath}: ${totalEntries} indexed entries.`;
}

function compareNodes(a: MapIndexNode, b: MapIndexNode): number {
	return a.label.localeCompare(b.label);
}

function countNodes(nodes: MapIndexNode[]): number {
	return nodes.reduce((count, node) => count + 1 + countNodes(node.children), 0);
}

function isMarkdownFile(file: TAbstractFile | null): file is TFile {
	const candidateFile = file as { basename?: unknown; extension?: unknown } | null;
	return !!candidateFile
		&& typeof candidateFile.basename === "string"
		&& typeof candidateFile.extension === "string"
		&& candidateFile.extension.toLowerCase() === "md";
}
