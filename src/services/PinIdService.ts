import type { PinType } from "./PinTypeService";

export interface GeneratePinIdInput {
	mapName: string;
	type: PinType;
	entityBasename: string;
	existingIds: ReadonlySet<string>;
}

export function generatePinId(input: GeneratePinIdInput): string {
	const baseId = [
		slugifyPinPart(input.mapName),
		input.type,
		slugifyPinPart(input.entityBasename),
	].join("__");

	if (!input.existingIds.has(baseId)) {
		return baseId;
	}

	let suffix = 2;
	let candidate = `${baseId}_${suffix}`;

	while (input.existingIds.has(candidate)) {
		suffix += 1;
		candidate = `${baseId}_${suffix}`;
	}

	return candidate;
}

export function slugifyPinPart(value: string): string {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.replace(/_+/g, "_");

	return slug || "item";
}
