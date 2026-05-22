import type { PinType } from "./PinTypeService";
import type { PinSubtype } from "./PinSubtypeService";
import { normalizePinSubtype } from "./PinSubtypeService";

export const INVALID_HIERARCHY_FOR_TYPE_MESSAGE = "Location hierarchy fields are only supported for location pins.";

export interface PinMetadataInput {
	subtype?: string;
	parentLocation?: string;
	region?: string;
	nation?: string;
}

export interface NormalizedPinMetadata {
	subtype?: PinSubtype;
	parentLocation?: string;
	region?: string;
	nation?: string;
}

export function normalizePinMetadata(type: PinType, input: PinMetadataInput): NormalizedPinMetadata {
	const metadata: NormalizedPinMetadata = {};
	const subtype = normalizePinSubtype(type, input.subtype);
	const parentLocation = buildHierarchyWikiLink(input.parentLocation);
	const region = buildHierarchyWikiLink(input.region);
	const nation = buildHierarchyWikiLink(input.nation);

	if (subtype) {
		metadata.subtype = subtype;
	}

	if (type !== "location") {
		if (parentLocation || region || nation) {
			throw new Error(INVALID_HIERARCHY_FOR_TYPE_MESSAGE);
		}

		return metadata;
	}

	if (parentLocation) {
		metadata.parentLocation = parentLocation;
	}

	if (region) {
		metadata.region = region;
	}

	if (nation) {
		metadata.nation = nation;
	}

	return metadata;
}

export function buildHierarchyWikiLink(value: string | undefined): string | undefined {
	const target = normalizeHierarchyLinkBody(value);

	return target ? `[[${target}]]` : undefined;
}

export function readHierarchyTarget(value: string | undefined): string | undefined {
	return normalizeHierarchyLinkTarget(value);
}

export function normalizeOptionalText(value: string | undefined): string | undefined {
	const normalized = value?.trim().replace(/\s+/g, " ");

	return normalized ? normalized : undefined;
}

function normalizeHierarchyLinkBody(value: string | undefined): string | undefined {
	return normalizeOptionalText(removeWikiLinkBrackets(value));
}

function normalizeHierarchyLinkTarget(value: string | undefined): string | undefined {
	const linkBody = normalizeHierarchyLinkBody(value);
	const aliasStart = linkBody?.indexOf("|") ?? -1;
	const target = aliasStart === -1
		? linkBody
		: linkBody?.slice(0, aliasStart);

	return normalizeOptionalText(target);
}

function removeWikiLinkBrackets(value: string | undefined): string | undefined {
	return value?.replace(/[\[\]]/g, "");
}
