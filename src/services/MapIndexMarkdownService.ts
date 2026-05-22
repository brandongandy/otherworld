import { PIN_TYPES, type PinType } from "./PinTypeService";

export const MALFORMED_INDEX_MARKERS_MESSAGE = "Existing index generated markers are malformed.";

export interface MapIndexNode {
	link: string;
	label: string;
	children: MapIndexNode[];
}

export interface IndexWarningGroup {
	heading: string;
	items: string[];
}

export type IndexSections = Record<PinType, MapIndexNode[]>;

export interface RenderIndexDocumentInput {
	title: string;
	sections: IndexSections;
	warningGroups: IndexWarningGroup[];
}

type MarkerKey = PinType | "warnings";

const SECTION_HEADERS: Record<PinType, string> = {
	location: "Locations",
	event: "Events",
	person: "People",
	faction: "Factions",
	item: "Items",
};

export function createEmptyIndexSections(): IndexSections {
	return {
		location: [],
		event: [],
		person: [],
		faction: [],
		item: [],
	};
}

export function renderIndexDocument(input: RenderIndexDocumentInput): string {
	const sections = PIN_TYPES.map((type) => renderTypeSection(type, input.sections[type]));
	const warningSection = renderWarningSection(input.warningGroups, false);
	return normalizeDocument([
		`# ${input.title}`,
		"",
		...sections,
		...(warningSection ? [warningSection] : []),
	].join("\n\n"));
}

export function mergeIndexDocument(existing: string, input: RenderIndexDocumentInput): string {
	validateGeneratedMarkers(existing);

	let merged = existing.trimEnd();
	for (const type of PIN_TYPES) {
		merged = upsertGeneratedSection(
			merged,
			type,
			`## ${SECTION_HEADERS[type]}`,
			renderNodeList(input.sections[type]),
		);
	}

	const hasExistingWarnings = hasMarkerPair(merged, "warnings") || hasSectionHeader(merged, "## Index warnings");
	if (input.warningGroups.some((group) => group.items.length > 0) || hasExistingWarnings) {
		merged = upsertGeneratedSection(
			merged,
			"warnings",
			"## Index warnings",
			input.warningGroups.some((group) => group.items.length > 0)
				? renderWarningGroups(input.warningGroups)
				: "No index warnings.",
		);
	}

	return ensureFinalNewline(merged);
}

function renderTypeSection(type: PinType, nodes: MapIndexNode[]): string {
	return [
		`## ${SECTION_HEADERS[type]}`,
		"",
		renderNodeList(nodes),
	].join("\n");
}

function renderWarningSection(groups: IndexWarningGroup[], keepEmpty: boolean): string | null {
	if (!keepEmpty && !groups.some((group) => group.items.length > 0)) {
		return null;
	}

	return [
		"## Index warnings",
		"",
		renderWarningGroups(groups),
	].join("\n");
}

function renderWarningGroups(groups: IndexWarningGroup[]): string {
	const renderedGroups = groups
		.filter((group) => group.items.length > 0)
		.map((group) => [
			`### ${group.heading}`,
			"",
			...group.items.map((item) => `- ${item}`),
		].join("\n"));

	return renderedGroups.length > 0 ? renderedGroups.join("\n\n") : "No index warnings.";
}

function renderNodeList(nodes: MapIndexNode[]): string {
	return nodes.length > 0 ? nodes.map((node) => renderNode(node, 0)).join("\n") : "No entries.";
}

function renderNode(node: MapIndexNode, depth: number): string {
	const indent = "  ".repeat(depth);
	const children = node.children.map((child) => renderNode(child, depth + 1));
	return [`${indent}- ${node.link}`, ...children].join("\n");
}

function upsertGeneratedSection(content: string, key: MarkerKey, header: string, block: string): string {
	const replaced = replaceMarkerBlock(content, key, block);
	if (replaced) {
		return replaced;
	}

	const replacedSection = replaceSectionBody(content, header, block);
	if (replacedSection) {
		return replacedSection;
	}

	const trimmed = content.trimEnd();
	return trimmed ? `${trimmed}\n\n${header}\n\n${block}` : `${header}\n\n${block}`;
}

function replaceMarkerBlock(content: string, key: MarkerKey, block: string): string | null {
	const start = startMarker(key);
	const end = endMarker(key);
	const startIndex = content.indexOf(start);
	const endIndex = content.indexOf(end);

	if (startIndex === -1 && endIndex === -1) {
		return null;
	}

	if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
		throw new Error(MALFORMED_INDEX_MARKERS_MESSAGE);
	}

	return `${content.slice(0, startIndex)}${block}${content.slice(endIndex + end.length)}`;
}

function replaceSectionBody(content: string, header: string, block: string): string | null {
	const headerRange = findSectionHeaderRange(content, header);

	if (!headerRange) {
		return null;
	}

	const bodyEnd = findNextSectionHeaderIndex(content, headerRange.end) ?? content.length;
	const after = content.slice(bodyEnd).replace(/^\n+/, "");

	return `${content.slice(0, headerRange.end)}\n\n${block}${after ? `\n\n${after}` : ""}`;
}

function hasSectionHeader(content: string, header: string): boolean {
	return findSectionHeaderRange(content, header) !== null;
}

function findSectionHeaderRange(content: string, header: string): { end: number } | null {
	const headerPattern = new RegExp(`(^|\\n)${escapeRegExp(header)}(?=\\n|$)`, "m");
	const headerMatch = headerPattern.exec(content);

	if (!headerMatch) {
		return null;
	}

	const headerStart = headerMatch.index + (headerMatch[1]?.length ?? 0);
	return {
		end: headerStart + header.length,
	};
}

function findNextSectionHeaderIndex(content: string, fromIndex: number): number | null {
	const nextHeaderPattern = /^## .*(?=\n|$)/gm;
	nextHeaderPattern.lastIndex = fromIndex;
	const headerMatch = nextHeaderPattern.exec(content);

	return headerMatch?.index ?? null;
}

function validateGeneratedMarkers(content: string): void {
	const markerStartPattern = /<!--\s*otherworld:index:/g;
	const stack: MarkerKey[] = [];
	const pairCounts = new Map<MarkerKey, number>();
	let match: RegExpExecArray | null;

	while ((match = markerStartPattern.exec(content)) !== null) {
		const markerEndIndex = content.indexOf("-->", match.index);
		if (markerEndIndex === -1) {
			throw new Error(MALFORMED_INDEX_MARKERS_MESSAGE);
		}

		const marker = content.slice(match.index, markerEndIndex + 3);
		const markerMatch = /^<!-- otherworld:index:([^:\s]+):([^:\s]+) -->$/.exec(marker);
		if (!markerMatch) {
			throw new Error(MALFORMED_INDEX_MARKERS_MESSAGE);
		}

		const keyValue = markerMatch[1];
		const directionValue = markerMatch[2];
		if (!keyValue || !directionValue) {
			throw new Error(MALFORMED_INDEX_MARKERS_MESSAGE);
		}

		if (!isMarkerKey(keyValue) || !isMarkerDirection(directionValue)) {
			throw new Error(MALFORMED_INDEX_MARKERS_MESSAGE);
		}

		const key = keyValue;
		const direction = directionValue;

		if (direction === "start") {
			if (stack.length > 0) {
				throw new Error(MALFORMED_INDEX_MARKERS_MESSAGE);
			}
			stack.push(key);
			continue;
		}

		const openKey = stack.pop();
		if (openKey !== key) {
			throw new Error(MALFORMED_INDEX_MARKERS_MESSAGE);
		}
		pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
		if ((pairCounts.get(key) ?? 0) > 1) {
			throw new Error(MALFORMED_INDEX_MARKERS_MESSAGE);
		}
	}

	if (stack.length > 0) {
		throw new Error(MALFORMED_INDEX_MARKERS_MESSAGE);
	}
}

function isMarkerKey(value: string): value is MarkerKey {
	return value === "warnings" || PIN_TYPES.includes(value as PinType);
}

function isMarkerDirection(value: string): value is "start" | "end" {
	return value === "start" || value === "end";
}

function hasMarkerPair(content: string, key: MarkerKey): boolean {
	return content.includes(startMarker(key)) && content.includes(endMarker(key));
}

function startMarker(key: MarkerKey): string {
	return `<!-- otherworld:index:${key}:start -->`;
}

function endMarker(key: MarkerKey): string {
	return `<!-- otherworld:index:${key}:end -->`;
}

function normalizeDocument(content: string): string {
	return `${content.replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function ensureFinalNewline(content: string): string {
	return `${content.trimEnd()}\n`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
