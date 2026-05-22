import type { PinType } from "./PinTypeService";

export const INVALID_PIN_SUBTYPE_MESSAGE = "Pin subtype is not supported for the selected type.";

export const PIN_SUBTYPES = {
	location: ["city", "town", "burg", "capital", "ruin", "landmark", "region", "nation", "province", "continent"],
	event: ["historical", "story", "battle", "disaster", "founding"],
	person: ["ruler", "noble", "soldier", "scholar", "merchant", "religious", "other"],
	faction: ["kingdom", "guild", "house", "cult", "army", "company", "other"],
	item: ["artifact", "weapon", "book", "relic", "other"],
} as const satisfies Record<PinType, readonly string[]>;

export type PinSubtype = typeof PIN_SUBTYPES[PinType][number];

export function getPinSubtypes(type: PinType): readonly string[] {
	return PIN_SUBTYPES[type];
}

export function isPinSubtype(type: PinType, value: unknown): value is PinSubtype {
	return typeof value === "string" && (PIN_SUBTYPES[type] as readonly string[]).includes(value);
}

export function normalizePinSubtype(type: PinType, value: string | undefined): PinSubtype | undefined {
	const subtype = value?.trim();

	if (!subtype) {
		return undefined;
	}

	if (!isPinSubtype(type, subtype)) {
		throw new Error(INVALID_PIN_SUBTYPE_MESSAGE);
	}

	return subtype;
}
