import type { PinType } from "./PinTypeService";
import {
	DEFAULT_ENTITY_NOTE_BODY,
	renderTemplateContent,
	type TemplateRenderContext,
} from "./TemplateService";

export interface BuildEntityNoteContentInput {
	displayName: string;
	mapName: string;
	mapPath: string;
	pinId: string;
	type: PinType;
	subtype?: string;
	parentLocation?: string;
	region?: string;
	nation?: string;
	x: number;
	y: number;
	bodyTemplate?: string;
}

export function buildEntityNoteContent(input: BuildEntityNoteContentInput): string {
	const template = buildEntityNoteTemplate(input);

	return [
		...buildEntityNoteFrontmatterLines(input, template.frontmatterLines),
		"",
		template.body,
		"",
	].join("\n");
}

export function buildEntityWikiLink(entityBasename: string, displayName: string): string {
	if (entityBasename === displayName) {
		return buildRawWikiLink(entityBasename);
	}

	return `[[${sanitizeWikiLinkTarget(entityBasename)}|${sanitizeWikiLinkAlias(displayName)}]]`;
}

export function buildParentLocationNoteContent(displayName: string): string {
	return [
		"---",
		"type: location",
		"subtype: region",
		"---",
		"",
		`# ${displayName}`,
		"",
		"## Description",
		"",
		"## Notes",
		"",
	].join("\n");
}

function buildEntityNoteFrontmatterLines(input: BuildEntityNoteContentInput, templateFrontmatterLines: string[] = []): string[] {
	return [
		"---",
		...templateFrontmatterLines,
		`type: ${input.type}`,
		...buildOptionalMetadataLines(input),
		"maps:",
		`  - map: ${formatYamlDoubleQuotedScalar(buildRawWikiLink(input.mapName))}`,
		`    mapPath: ${formatYamlScalar(input.mapPath)}`,
		`    pinId: ${formatYamlScalar(input.pinId)}`,
		`    x: ${input.x}`,
		`    y: ${input.y}`,
		"---",
	];
}

function buildEntityNoteTemplate(input: BuildEntityNoteContentInput): { frontmatterLines: string[]; body: string } {
	const template = input.bodyTemplate ?? DEFAULT_ENTITY_NOTE_BODY;
	const context = buildTemplateContext(input);
	const leadingFrontmatter = splitLeadingFrontmatter(template);

	if (!leadingFrontmatter) {
		return {
			frontmatterLines: [],
			body: renderTemplateContent(template, context),
		};
	}

	const renderedFrontmatter = renderTemplateContent(leadingFrontmatter.frontmatterLines.join("\n"), context);

	return {
		frontmatterLines: filterTemplateFrontmatterLines(renderedFrontmatter.split("\n")),
		body: removeLeadingBlankLines(renderTemplateContent(leadingFrontmatter.body, context)),
	};
}

function splitLeadingFrontmatter(content: string): { frontmatterLines: string[]; body: string } | null {
	const lines = content.split(/\r?\n/);

	if (lines[0] !== "---") {
		return null;
	}

	const closingDelimiterIndex = lines.findIndex((line, index) => index > 0 && line === "---");

	if (closingDelimiterIndex === -1) {
		return null;
	}

	return {
		frontmatterLines: lines.slice(1, closingDelimiterIndex),
		body: lines.slice(closingDelimiterIndex + 1).join("\n"),
	};
}

function filterTemplateFrontmatterLines(lines: string[]): string[] {
	const filteredLines: string[] = [];
	let skippingReservedKey = false;

	for (const line of lines) {
		const topLevelKey = getTopLevelYamlKey(line);

		if (topLevelKey) {
			skippingReservedKey = RESERVED_TEMPLATE_FRONTMATTER_KEYS.has(topLevelKey);

			if (!skippingReservedKey) {
				filteredLines.push(line);
			}

			continue;
		}

		if (!skippingReservedKey) {
			filteredLines.push(line);
		}
	}

	return filteredLines;
}

function removeLeadingBlankLines(content: string): string {
	return content.replace(/^(?:[ \t]*\n)+/, "");
}

// Conservative helper for simple top-level mapping keys; this is not a general YAML parser.
function getTopLevelYamlKey(line: string): string | null {
	if (/^\s/.test(line)) {
		return null;
	}

	const match = /^(?:"([^"]+)"|'([^']+)'|([^:#\s][^:#]*)):(?:\s|$)/.exec(line);
	const key = match?.[1] ?? match?.[2] ?? match?.[3];
	return key ? key.trim() : null;
}

function buildTemplateContext(input: BuildEntityNoteContentInput): TemplateRenderContext {
	return {
		name: input.displayName,
		type: input.type,
		subtype: input.subtype,
		map: input.mapName,
		mapPath: input.mapPath,
		x: input.x,
		y: input.y,
		pinId: input.pinId,
		parentLocation: input.parentLocation,
		nation: input.nation,
		region: input.region,
	};
}

const RESERVED_TEMPLATE_FRONTMATTER_KEYS = new Set([
	"type",
	"subtype",
	"maps",
	"map",
	"mapPath",
	"pinId",
	"x",
	"y",
	"parentLocation",
	"region",
	"nation",
]);

function buildOptionalMetadataLines(input: BuildEntityNoteContentInput): string[] {
	const lines: string[] = [];

	if (input.subtype) {
		lines.push(`subtype: ${formatYamlScalar(input.subtype)}`);
	}

	if (input.parentLocation) {
		lines.push(`parentLocation: ${formatYamlDoubleQuotedScalar(input.parentLocation)}`);
	}

	if (input.region) {
		lines.push(`region: ${formatYamlDoubleQuotedScalar(input.region)}`);
	}

	if (input.nation) {
		lines.push(`nation: ${formatYamlDoubleQuotedScalar(input.nation)}`);
	}

	return lines;
}

function buildRawWikiLink(target: string): string {
	return `[[${sanitizeWikiLinkTarget(target)}]]`;
}

function sanitizeWikiLinkTarget(value: string): string {
	return value.replace(/[[\]]/g, "").trim();
}

function sanitizeWikiLinkAlias(value: string): string {
	return value.replace(/[[\]|]/g, "").trim();
}

function formatYamlScalar(value: string): string {
	if (canUsePlainYamlScalar(value)) {
		return value;
	}

	return `'${value.replace(/'/g, "''")}'`;
}

function formatYamlDoubleQuotedScalar(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function canUsePlainYamlScalar(value: string): boolean {
	return value.length > 0
		&& value.trim() === value
		&& !/^[?-]/.test(value)
		&& !/[#[\]{},:&*!"'|>%@`:]/.test(value);
}
