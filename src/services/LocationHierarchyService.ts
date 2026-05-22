import type { TFile } from "obsidian";
import type { MapPin } from "../types";
import { readHierarchyTarget } from "./PinMetadataService";
import { buildWikiLink, readWikiLinkDisplayText, readWikiLinkTarget, wikiLinkKey } from "./WikiLinkService";
import type { IndexWarningGroup, MapIndexNode } from "./MapIndexMarkdownService";

export interface LocationHierarchyInput {
	sourcePath: string;
	locations: LocationHierarchyLocation[];
}

export interface LocationHierarchyLocation {
	pin: MapPin;
	entityFile: TFile | null;
	frontmatter?: Record<string, unknown>;
}

export interface LocationHierarchyResult {
	roots: MapIndexNode[];
	warningGroups: IndexWarningGroup[];
	duplicateCount: number;
}

export interface LocationHierarchyDependencies {
	resolveLink(target: string, sourcePath: string): TFile | null;
	loadFrontmatter(file: TFile): Record<string, unknown> | undefined;
}

interface LocationNodeState {
	key: string;
	link: string;
	label: string;
	parentKey: string | null;
	children: LocationNodeState[];
	includeInNormalTree: boolean;
}

export class LocationHierarchyService {
	constructor(private readonly dependencies: LocationHierarchyDependencies) {}

	buildHierarchy(input: LocationHierarchyInput): LocationHierarchyResult {
		const duplicateCount = countDuplicateLocations(input.locations);
		const nodes = new Map<string, LocationNodeState>();
		const missingEntityWarnings: string[] = [];
		const unresolvedParentWarnings: string[] = [];

		for (const location of dedupeLocations(input.locations)) {
			if (!location.entityFile) {
				missingEntityWarnings.push(`${location.pin.link} points to \`${location.pin.entityPath}\`, but that file was not found.`);
			}

			const parentLink = this.readParentLink(location);
			const node = this.getOrCreateNode(nodes, {
				key: locationNodeKey(location),
				link: location.pin.link,
				label: location.pin.name || readWikiLinkDisplayText(location.pin.link),
			});

			if (!parentLink) {
				continue;
			}

			const parentTarget = readHierarchyTarget(parentLink) ?? readWikiLinkTarget(parentLink);
			const parentFile = this.dependencies.resolveLink(parentTarget, input.sourcePath);

			if (!parentFile) {
				unresolvedParentWarnings.push(`${location.pin.link} references missing parent ${buildWikiLink(parentTarget)}.`);
				continue;
			}

			this.attachParent(node, parentFile, parentTarget, input.sourcePath, nodes, unresolvedParentWarnings, new Set([node.key]));
		}

		const cycleWarnings = markCycles(nodes);
		linkChildren(nodes);

		const roots = [...nodes.values()]
			.filter((node) => node.includeInNormalTree && !node.parentKey)
			.map(toMapIndexNode)
			.sort(compareNodes);

		const warningGroups = buildWarningGroups({
			missingEntityWarnings,
			unresolvedParentWarnings,
			cycleWarnings,
		});

		return {
			roots,
			warningGroups,
			duplicateCount,
		};
	}

	private readParentLink(location: LocationHierarchyLocation): string | undefined {
		const frontmatterParent = readFrontmatterString(location.frontmatter?.parentLocation);
		if (frontmatterParent) {
			return frontmatterParent;
		}

		if (!location.entityFile && location.pin.parentLocation) {
			return location.pin.parentLocation;
		}

		return undefined;
	}

	private attachParent(
		child: LocationNodeState,
		parentFile: TFile,
		parentTarget: string,
		sourcePath: string,
		nodes: Map<string, LocationNodeState>,
		unresolvedParentWarnings: string[],
		visitedKeys: Set<string>,
	): void {
		const parentLink = buildResolvedFileLink(parentFile, parentTarget);
		const parentNode = this.getOrCreateNode(nodes, {
			key: fileKey(parentFile),
			link: parentLink,
			label: parentFile.basename,
		});
		child.parentKey = parentNode.key;

		if (visitedKeys.has(parentNode.key)) {
			return;
		}

		visitedKeys.add(parentNode.key);
		const parentFrontmatter = this.dependencies.loadFrontmatter(parentFile);
		const parentParentLink = readFrontmatterString(parentFrontmatter?.parentLocation);
		if (!parentParentLink) {
			return;
		}

		const grandParentTarget = readHierarchyTarget(parentParentLink) ?? readWikiLinkTarget(parentParentLink);
		const grandParentFile = this.dependencies.resolveLink(grandParentTarget, sourcePath);
		if (!grandParentFile) {
			unresolvedParentWarnings.push(`${parentNode.link} references missing parent ${buildWikiLink(grandParentTarget)}.`);
			return;
		}

		this.attachParent(parentNode, grandParentFile, grandParentTarget, sourcePath, nodes, unresolvedParentWarnings, visitedKeys);
	}

	private getOrCreateNode(nodes: Map<string, LocationNodeState>, input: {
		key: string;
		link: string;
		label: string;
	}): LocationNodeState {
		const existing = nodes.get(input.key);
		if (existing) {
			return existing;
		}

		const node: LocationNodeState = {
			...input,
			parentKey: null,
			children: [],
			includeInNormalTree: true,
		};
		nodes.set(input.key, node);
		return node;
	}
}

function dedupeLocations(locations: LocationHierarchyLocation[]): LocationHierarchyLocation[] {
	const seen = new Set<string>();
	const deduped: LocationHierarchyLocation[] = [];

	for (const location of locations) {
		const key = locationNodeKey(location);
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		deduped.push(location);
	}

	return deduped;
}

function countDuplicateLocations(locations: LocationHierarchyLocation[]): number {
	const seen = new Set<string>();
	let duplicates = 0;

	for (const location of locations) {
		const key = locationNodeKey(location);
		if (seen.has(key)) {
			duplicates += 1;
		} else {
			seen.add(key);
		}
	}

	return duplicates;
}

function locationNodeKey(location: LocationHierarchyLocation): string {
	return location.entityFile ? fileKey(location.entityFile) : wikiLinkKey(location.pin.link);
}

function fileKey(file: TFile): string {
	return wikiLinkKey(buildWikiLink(file.path));
}

function buildResolvedFileLink(file: TFile, requestedTarget: string): string {
	return requestedTarget.includes("/") ? buildWikiLink(requestedTarget) : buildWikiLink(file.basename);
}

function markCycles(nodes: Map<string, LocationNodeState>): string[] {
	const warnings: string[] = [];

	for (const node of nodes.values()) {
		if (!node.includeInNormalTree) {
			continue;
		}

		const chain: LocationNodeState[] = [];
		const seen = new Set<string>();
		let current: LocationNodeState | undefined = node;

		while (current) {
			if (seen.has(current.key)) {
				const cycleStart = chain.findIndex((item) => item.key === current?.key);
				const cycle = [...chain.slice(cycleStart), current];
				for (const cycleNode of cycle) {
					cycleNode.includeInNormalTree = false;
				}
				const warning = `Cycle detected: ${cycle.map((item) => item.link).join(" -> ")}.`;
				if (!warnings.includes(warning)) {
					warnings.push(warning);
				}
				break;
			}

			seen.add(current.key);
			chain.push(current);
			current = current.parentKey ? nodes.get(current.parentKey) : undefined;
		}
	}

	return warnings;
}

function linkChildren(nodes: Map<string, LocationNodeState>): void {
	for (const node of nodes.values()) {
		node.children.length = 0;
	}

	for (const node of nodes.values()) {
		if (!node.includeInNormalTree || !node.parentKey) {
			continue;
		}

		const parent = nodes.get(node.parentKey);
		if (parent?.includeInNormalTree) {
			parent.children.push(node);
		}
	}

	for (const node of nodes.values()) {
		node.children.sort(compareNodeStates);
	}
}

function toMapIndexNode(node: LocationNodeState): MapIndexNode {
	return {
		link: node.link,
		label: node.label,
		children: node.children.filter((child) => child.includeInNormalTree).map(toMapIndexNode).sort(compareNodes),
	};
}

function compareNodeStates(a: LocationNodeState, b: LocationNodeState): number {
	return a.label.localeCompare(b.label);
}

function compareNodes(a: MapIndexNode, b: MapIndexNode): number {
	return a.label.localeCompare(b.label);
}

function buildWarningGroups(input: {
	missingEntityWarnings: string[];
	unresolvedParentWarnings: string[];
	cycleWarnings: string[];
}): IndexWarningGroup[] {
	return [
		{
			heading: "Missing entity notes",
			items: input.missingEntityWarnings,
		},
		{
			heading: "Unresolved location parents",
			items: input.unresolvedParentWarnings,
		},
		{
			heading: "Location hierarchy cycles",
			items: input.cycleWarnings,
		},
	].filter((group) => group.items.length > 0);
}

function readFrontmatterString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
