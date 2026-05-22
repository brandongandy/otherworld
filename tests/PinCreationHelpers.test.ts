import { describe, expect, it } from "vitest";
import {
	buildEntityNoteContent,
	buildEntityWikiLink,
} from "../src/services/EntityNoteService";
import { sanitizeEntityFileName } from "../src/services/FileNameService";
import { generatePinId, slugifyPinPart } from "../src/services/PinIdService";
import { isPinType, PIN_TYPES } from "../src/services/PinTypeService";

describe("pin creation helpers", () => {
	it("exposes the phase 3A pin types", () => {
		expect(PIN_TYPES).toEqual(["location", "event", "person", "faction", "item"]);
		expect(isPinType("location")).toBe(true);
		expect(isPinType("planet")).toBe(false);
	});

	it("sanitizes unsafe filenames while preserving display names", () => {
		expect(sanitizeEntityFileName(" Red Ford: North Gate? ")).toEqual({
			displayName: "Red Ford: North Gate?",
			basename: "Red Ford North Gate",
			fileName: "Red Ford North Gate.md",
		});
	});

	it("rejects names that sanitize to empty filenames", () => {
		expect(sanitizeEntityFileName("???")).toBeNull();
		expect(sanitizeEntityFileName("   ")).toBeNull();
	});

	it("prevents traversal-like and unsafe filename input", () => {
		expect(sanitizeEntityFileName("../Aldmere")).toEqual({
			displayName: "../Aldmere",
			basename: "Aldmere",
			fileName: "Aldmere.md",
		});
		expect(sanitizeEntityFileName("A/B")).toEqual({
			displayName: "A/B",
			basename: "A B",
			fileName: "A B.md",
		});
		expect(sanitizeEntityFileName("A\\B")).toEqual({
			displayName: "A\\B",
			basename: "A B",
			fileName: "A B.md",
		});
		expect(sanitizeEntityFileName(".././")).toBeNull();
	});

	it("slugifies pin id parts", () => {
		expect(slugifyPinPart("Red Ford: North Gate?")).toBe("red_ford_north_gate");
		expect(slugifyPinPart("  Aldmere  ")).toBe("aldmere");
	});

	it("generates readable pin ids and collision suffixes", () => {
		expect(generatePinId({
			mapName: "World",
			type: "location",
			entityBasename: "Aldmere",
			existingIds: new Set(),
		})).toBe("world__location__aldmere");

		expect(generatePinId({
			mapName: "World",
			type: "location",
			entityBasename: "Aldmere",
			existingIds: new Set(["world__location__aldmere", "world__location__aldmere_2"]),
		})).toBe("world__location__aldmere_3");
	});

	it("builds wikilinks with aliases when display names differ from filenames", () => {
		expect(buildEntityWikiLink("Aldmere", "Aldmere")).toBe("[[Aldmere]]");
		expect(buildEntityWikiLink("Red Ford North Gate", "Red Ford: North Gate?"))
			.toBe("[[Red Ford North Gate|Red Ford: North Gate?]]");
	});

	it("builds a new entity note with type and map reference frontmatter", () => {
		expect(buildEntityNoteContent({
			displayName: "Aldmere",
			mapName: "World",
			mapPath: "World/World.md",
			pinId: "world__location__aldmere",
			type: "location",
			x: 0.421,
			y: 0.337,
		})).toBe([
			"---",
			"type: location",
			"maps:",
			"  - map: \"[[World]]\"",
			"    mapPath: World/World.md",
			"    pinId: world__location__aldmere",
			"    x: 0.421",
			"    y: 0.337",
			"---",
			"",
			"# Aldmere",
			"",
			"## Description",
			"",
			"## Notes",
			"",
		].join("\n"));
	});

	it("escapes map wikilinks as YAML double-quoted scalars", () => {
		expect(buildEntityNoteContent({
			displayName: "Aldmere",
			mapName: "World \"Prime\"",
			mapPath: "World/World Prime.md",
			pinId: "world_prime__location__aldmere",
			type: "location",
			x: 0.421,
			y: 0.337,
		}).split("\n")[3]).toBe("  - map: \"[[World \\\"Prime\\\"]]\"");
	});

	it("builds a location entity note with subtype and hierarchy metadata", () => {
		expect(buildEntityNoteContent({
			displayName: "Aldmere",
			mapName: "World",
			mapPath: "World/World.md",
			pinId: "world__location__aldmere",
			type: "location",
			subtype: "city",
			parentLocation: "[[Northern Marches]]",
			region: "[[Northern Marches]]",
			nation: "[[Valoria]]",
			x: 0.421,
			y: 0.337,
		})).toBe([
			"---",
			"type: location",
			"subtype: city",
			"parentLocation: \"[[Northern Marches]]\"",
			"region: \"[[Northern Marches]]\"",
			"nation: \"[[Valoria]]\"",
			"maps:",
			"  - map: \"[[World]]\"",
			"    mapPath: World/World.md",
			"    pinId: world__location__aldmere",
			"    x: 0.421",
			"    y: 0.337",
			"---",
			"",
			"# Aldmere",
			"",
			"## Description",
			"",
			"## Notes",
			"",
		].join("\n"));
	});

	it("builds a non-location entity note with subtype but without hierarchy metadata", () => {
		expect(buildEntityNoteContent({
			displayName: "Battle of Red Ford",
			mapName: "World",
			mapPath: "World/World.md",
			pinId: "world__event__battle_of_red_ford",
			type: "event",
			subtype: "battle",
			x: 0.512,
			y: 0.691,
		})).toBe([
			"---",
			"type: event",
			"subtype: battle",
			"maps:",
			"  - map: \"[[World]]\"",
			"    mapPath: World/World.md",
			"    pinId: world__event__battle_of_red_ford",
			"    x: 0.512",
			"    y: 0.691",
			"---",
			"",
			"# Battle of Red Ford",
			"",
			"## Description",
			"",
			"## Notes",
			"",
		].join("\n"));
	});

	it("builds a new entity note with a rendered template body", () => {
		expect(buildEntityNoteContent({
			displayName: "Aldmere",
			mapName: "World",
			mapPath: "World/World.md",
			pinId: "world__location__aldmere",
			type: "location",
			subtype: "city",
			parentLocation: "[[Northern Marches]]",
			region: "[[Northern Marches]]",
			nation: "[[Valoria]]",
			x: 0.421,
			y: 0.337,
			bodyTemplate: [
				"# {{name}}",
				"",
				"Subtype: {{subtype}}",
				"Map: {{map}}",
				"Parent: {{parentLocation}}",
				"Unknown: {{storyArc}}",
			].join("\n"),
		})).toBe([
			"---",
			"type: location",
			"subtype: city",
			"parentLocation: \"[[Northern Marches]]\"",
			"region: \"[[Northern Marches]]\"",
			"nation: \"[[Valoria]]\"",
			"maps:",
			"  - map: \"[[World]]\"",
			"    mapPath: World/World.md",
			"    pinId: world__location__aldmere",
			"    x: 0.421",
			"    y: 0.337",
			"---",
			"",
			"# Aldmere",
			"",
			"Subtype: city",
			"Map: World",
			"Parent: [[Northern Marches]]",
			"Unknown: {{storyArc}}",
			"",
		].join("\n"));
	});

	it("merges rendered template frontmatter into generated entity frontmatter", () => {
		const content = buildEntityNoteContent({
			displayName: "Aldmere",
			mapName: "World",
			mapPath: "World/World.md",
			pinId: "world__location__aldmere",
			type: "location",
			subtype: "city",
			parentLocation: "[[Northern Marches]]",
			region: "[[Northern Marches]]",
			nation: "[[Valoria]]",
			x: 0.421,
			y: 0.337,
			bodyTemplate: [
				"---",
				"aliases:",
				"  - {{name}}",
				"tags:",
				"  - worldbuilding/{{type}}",
				"status: draft",
				"type: should-not-win",
				"subtype: should-not-win",
				"maps:",
				"  - should-not-win",
				"---",
				"# {{name}}",
				"",
				"Type: {{type}}",
			].join("\n"),
		});

		expect(content).toBe([
			"---",
			"aliases:",
			"  - Aldmere",
			"tags:",
			"  - worldbuilding/location",
			"status: draft",
			"type: location",
			"subtype: city",
			"parentLocation: \"[[Northern Marches]]\"",
			"region: \"[[Northern Marches]]\"",
			"nation: \"[[Valoria]]\"",
			"maps:",
			"  - map: \"[[World]]\"",
			"    mapPath: World/World.md",
			"    pinId: world__location__aldmere",
			"    x: 0.421",
			"    y: 0.337",
			"---",
			"",
			"# Aldmere",
			"",
			"Type: location",
			"",
		].join("\n"));
		expect(content.match(/^---$/gm)).toHaveLength(2);
		expect(content).not.toContain("should-not-win");
	});

	it("filters quoted reserved template frontmatter keys while preserving quoted custom keys", () => {
		const content = buildEntityNoteContent({
			displayName: "Aldmere",
			mapName: "World",
			mapPath: "World/World.md",
			pinId: "world__location__aldmere",
			type: "location",
			x: 0.421,
			y: 0.337,
			bodyTemplate: [
				"---",
				"\"type\": should-not-win",
				"'maps':",
				"  - should-not-win",
				"\"status\": draft",
				"---",
				"# {{name}}",
			].join("\n"),
		});

		expect(content).toBe([
			"---",
			"\"status\": draft",
			"type: location",
			"maps:",
			"  - map: \"[[World]]\"",
			"    mapPath: World/World.md",
			"    pinId: world__location__aldmere",
			"    x: 0.421",
			"    y: 0.337",
			"---",
			"",
			"# Aldmere",
			"",
		].join("\n"));
		expect(content).not.toContain("should-not-win");
	});

	it("keeps one blank line between generated frontmatter and template body", () => {
		expect(buildEntityNoteContent({
			displayName: "Aldmere",
			mapName: "World",
			mapPath: "World/World.md",
			pinId: "world__location__aldmere",
			type: "location",
			x: 0.421,
			y: 0.337,
			bodyTemplate: [
				"---",
				"status: draft",
				"---",
				"",
				"# {{name}}",
			].join("\n"),
		})).toBe([
			"---",
			"status: draft",
			"type: location",
			"maps:",
			"  - map: \"[[World]]\"",
			"    mapPath: World/World.md",
			"    pinId: world__location__aldmere",
			"    x: 0.421",
			"    y: 0.337",
			"---",
			"",
			"# Aldmere",
			"",
		].join("\n"));
	});

	it("preserves custom nested frontmatter after filtering a reserved block", () => {
		const content = buildEntityNoteContent({
			displayName: "Aldmere",
			mapName: "World",
			mapPath: "World/World.md",
			pinId: "world__location__aldmere",
			type: "location",
			x: 0.421,
			y: 0.337,
			bodyTemplate: [
				"---",
				"maps:",
				"  - map: should-not-win",
				"    pinId: should-not-win",
				"custom:",
				"  nested: {{name}}",
				"  list:",
				"    - kept",
				"---",
				"# {{name}}",
			].join("\n"),
		});

		expect(content).toBe([
			"---",
			"custom:",
			"  nested: Aldmere",
			"  list:",
			"    - kept",
			"type: location",
			"maps:",
			"  - map: \"[[World]]\"",
			"    mapPath: World/World.md",
			"    pinId: world__location__aldmere",
			"    x: 0.421",
			"    y: 0.337",
			"---",
			"",
			"# Aldmere",
			"",
		].join("\n"));
		expect(content).not.toContain("should-not-win");
	});

	it("filters every reserved template frontmatter key", () => {
		const content = buildEntityNoteContent({
			displayName: "Aldmere",
			mapName: "World",
			mapPath: "World/World.md",
			pinId: "world__location__aldmere",
			type: "location",
			subtype: "city",
			parentLocation: "[[Northern Marches]]",
			region: "[[Northern Marches]]",
			nation: "[[Valoria]]",
			x: 0.421,
			y: 0.337,
			bodyTemplate: [
				"---",
				"type: should-not-win",
				"subtype: should-not-win",
				"maps:",
				"  - should-not-win",
				"map: should-not-win",
				"mapPath: should-not-win",
				"pinId: should-not-win",
				"x: should-not-win",
				"y: should-not-win",
				"parentLocation: should-not-win",
				"region: should-not-win",
				"nation: should-not-win",
				"custom: kept",
				"---",
				"# {{name}}",
			].join("\n"),
		});

		expect(content).toContain("custom: kept");
		expect(content).toContain("type: location");
		expect(content).toContain("subtype: city");
		expect(content).toContain("parentLocation: \"[[Northern Marches]]\"");
		expect(content).toContain("region: \"[[Northern Marches]]\"");
		expect(content).toContain("nation: \"[[Valoria]]\"");
		expect(content).toContain("    mapPath: World/World.md");
		expect(content).toContain("    pinId: world__location__aldmere");
		expect(content).toContain("    x: 0.421");
		expect(content).toContain("    y: 0.337");
		expect(content).not.toContain("should-not-win");
	});

	it("treats incomplete leading template frontmatter as body text", () => {
		expect(buildEntityNoteContent({
			displayName: "Aldmere",
			mapName: "World",
			mapPath: "World/World.md",
			pinId: "world__location__aldmere",
			type: "location",
			x: 0.421,
			y: 0.337,
			bodyTemplate: [
				"---",
				"status: draft",
				"# {{name}}",
			].join("\n"),
		})).toBe([
			"---",
			"type: location",
			"maps:",
			"  - map: \"[[World]]\"",
			"    mapPath: World/World.md",
			"    pinId: world__location__aldmere",
			"    x: 0.421",
			"    y: 0.337",
			"---",
			"",
			"---",
			"status: draft",
			"# Aldmere",
			"",
		].join("\n"));
	});

	it("keeps non-leading frontmatter-looking delimiters in the body", () => {
		expect(buildEntityNoteContent({
			displayName: "Aldmere",
			mapName: "World",
			mapPath: "World/World.md",
			pinId: "world__location__aldmere",
			type: "location",
			x: 0.421,
			y: 0.337,
			bodyTemplate: [
				"# {{name}}",
				"---",
				"status: draft",
				"---",
			].join("\n"),
		})).toBe([
			"---",
			"type: location",
			"maps:",
			"  - map: \"[[World]]\"",
			"    mapPath: World/World.md",
			"    pinId: world__location__aldmere",
			"    x: 0.421",
			"    y: 0.337",
			"---",
			"",
			"# Aldmere",
			"---",
			"status: draft",
			"---",
			"",
		].join("\n"));
	});

	it("detects template frontmatter before rendering tokens", () => {
		expect(buildEntityNoteContent({
			displayName: "---",
			mapName: "World",
			mapPath: "World/World.md",
			pinId: "world__location__delimiter",
			type: "location",
			x: 0.421,
			y: 0.337,
			bodyTemplate: [
				"{{name}}",
				"status: draft",
				"---",
				"# Rendered delimiter stays body",
			].join("\n"),
		})).toBe([
			"---",
			"type: location",
			"maps:",
			"  - map: \"[[World]]\"",
			"    mapPath: World/World.md",
			"    pinId: world__location__delimiter",
			"    x: 0.421",
			"    y: 0.337",
			"---",
			"",
			"---",
			"status: draft",
			"---",
			"# Rendered delimiter stays body",
			"",
		].join("\n"));
	});

	it("escapes optional metadata scalars in entity note frontmatter", () => {
		expect(buildEntityNoteContent({
			displayName: "Aldmere",
			mapName: "World",
			mapPath: "World/World.md",
			pinId: "world__location__aldmere",
			type: "location",
			subtype: "city: capital",
			parentLocation: "[[Northern \"Marches\"]]",
			region: "[[North\\West]]",
			nation: "[[Valoria]]",
			x: 0.421,
			y: 0.337,
		})).toBe([
			"---",
			"type: location",
			"subtype: 'city: capital'",
			"parentLocation: \"[[Northern \\\"Marches\\\"]]\"",
			"region: \"[[North\\\\West]]\"",
			"nation: \"[[Valoria]]\"",
			"maps:",
			"  - map: \"[[World]]\"",
			"    mapPath: World/World.md",
			"    pinId: world__location__aldmere",
			"    x: 0.421",
			"    y: 0.337",
			"---",
			"",
			"# Aldmere",
			"",
			"## Description",
			"",
			"## Notes",
			"",
		].join("\n"));
	});
});
