import { describe, expect, it } from "vitest";
import {
	buildHierarchyWikiLink,
	INVALID_HIERARCHY_FOR_TYPE_MESSAGE,
	normalizeOptionalText,
	normalizePinMetadata,
	readHierarchyTarget,
} from "../src/services/PinMetadataService";
import {
	INVALID_PIN_SUBTYPE_MESSAGE,
	isPinSubtype,
	normalizePinSubtype,
	PIN_SUBTYPES,
} from "../src/services/PinSubtypeService";

describe("PinSubtypeService", () => {
	it("exposes default subtype lists for each pin type", () => {
		expect(PIN_SUBTYPES).toEqual({
			location: ["city", "town", "burg", "capital", "ruin", "landmark", "region", "nation", "province", "continent"],
			event: ["historical", "story", "battle", "disaster", "founding"],
			person: ["ruler", "noble", "soldier", "scholar", "merchant", "religious", "other"],
			faction: ["kingdom", "guild", "house", "cult", "army", "company", "other"],
			item: ["artifact", "weapon", "book", "relic", "other"],
		});
	});

	it("validates subtype values against the selected type", () => {
		expect(isPinSubtype("location", "city")).toBe(true);
		expect(isPinSubtype("event", "battle")).toBe(true);
		expect(isPinSubtype("event", "city")).toBe(false);
		expect(isPinSubtype("location", "")).toBe(false);
	});

	it("normalizes blank subtype input to undefined", () => {
		expect(normalizePinSubtype("location", "")).toBeUndefined();
		expect(normalizePinSubtype("location", "   ")).toBeUndefined();
		expect(normalizePinSubtype("event", undefined)).toBeUndefined();
	});

	it("rejects unsupported subtype input", () => {
		expect(() => normalizePinSubtype("event", "city"))
			.toThrow(INVALID_PIN_SUBTYPE_MESSAGE);
	});
});

describe("PinMetadataService", () => {
	it("normalizes optional text by trimming and collapsing whitespace", () => {
		expect(normalizeOptionalText("  Northern   Marches ")).toBe("Northern Marches");
		expect(normalizeOptionalText("   ")).toBeUndefined();
		expect(normalizeOptionalText(undefined)).toBeUndefined();
	});

	it("builds hierarchy wikilinks from plain text", () => {
		expect(buildHierarchyWikiLink("  Northern   Marches ")).toBe("[[Northern Marches]]");
		expect(buildHierarchyWikiLink("[[Northern Marches]]")).toBe("[[Northern Marches]]");
		expect(buildHierarchyWikiLink("  [[Valoria]]  ")).toBe("[[Valoria]]");
		expect(buildHierarchyWikiLink("   ")).toBeUndefined();
	});

	it("preserves hierarchy wikilink aliases", () => {
		expect(buildHierarchyWikiLink("[[Northern Marches|the Marches]]")).toBe("[[Northern Marches|the Marches]]");
	});

	it("normalizes location metadata into subtype and wikilinks", () => {
		expect(normalizePinMetadata("location", {
			subtype: "city",
			parentLocation: "Northern Marches",
			region: " Northern   Marches ",
			nation: "[[Valoria]]",
		})).toEqual({
			subtype: "city",
			parentLocation: "[[Northern Marches]]",
			region: "[[Northern Marches]]",
			nation: "[[Valoria]]",
		});
	});

	it("preserves aliased parent location metadata", () => {
		expect(normalizePinMetadata("location", {
			parentLocation: "[[Northern Marches|the Marches]]",
		})).toEqual({
			parentLocation: "[[Northern Marches|the Marches]]",
		});
	});

	it("reads hierarchy targets without aliases", () => {
		expect(readHierarchyTarget("[[Northern Marches|the Marches]]")).toBe("Northern Marches");
	});

	it("reads folder-qualified hierarchy targets without aliases", () => {
		expect(readHierarchyTarget("[[Regions/Northern Marches|the Marches]]")).toBe("Regions/Northern Marches");
	});

	it("normalizes non-location subtype metadata", () => {
		expect(normalizePinMetadata("event", {
			subtype: "battle",
		})).toEqual({
			subtype: "battle",
		});
	});

	it("rejects hierarchy fields for non-location pins", () => {
		expect(() => normalizePinMetadata("event", {
			subtype: "battle",
			parentLocation: "Northern Marches",
		})).toThrow(INVALID_HIERARCHY_FOR_TYPE_MESSAGE);
	});
});
