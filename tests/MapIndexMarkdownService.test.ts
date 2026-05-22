import { describe, expect, it } from "vitest";
import {
	MALFORMED_INDEX_MARKERS_MESSAGE,
	createEmptyIndexSections,
	mergeIndexDocument,
	renderIndexDocument,
	type IndexWarningGroup,
	type MapIndexNode,
} from "../src/services/MapIndexMarkdownService";

describe("MapIndexMarkdownService", () => {
	it("creates a full index document with typed sections", () => {
		const document = renderIndexDocument({
			title: "World Index",
			sections: {
				...createEmptyIndexSections(),
				location: [
					node("[[Valoria]]", "Valoria", [
						node("[[Aldmere]]", "Aldmere"),
					]),
					node("[[Independent Ruin]]", "Independent Ruin"),
				],
				event: [node("[[Battle of Red Ford]]", "Battle of Red Ford")],
			},
			warningGroups: [],
		});

		expect(document).toContain("# World Index");
		expect(document).toContain("## Locations");
		expectNoGeneratedMarkers(document);
		expect(document).toContain("- [[Valoria]]\n  - [[Aldmere]]");
		expect(document).toContain("## Events");
		expect(document).toContain("- [[Battle of Red Ford]]");
		expect(document).toContain("## People");
		expect(document).not.toContain("## Index warnings");
	});

	it("renders warnings when warning groups have items", () => {
		const warningGroups: IndexWarningGroup[] = [
			{
				heading: "Missing entity notes",
				items: ["[[Old Watchtower]] points to `Locations/Old Watchtower.md`, but that file was not found."],
			},
		];

		const document = renderIndexDocument({
			title: "World Index",
			sections: createEmptyIndexSections(),
			warningGroups,
		});

		expect(document).toContain("## Index warnings");
		expect(document).toContain("### Missing entity notes");
		expect(document).toContain("- [[Old Watchtower]] points to `Locations/Old Watchtower.md`, but that file was not found.");
		expectNoGeneratedMarkers(document);
	});

	it("replaces existing marker blocks while preserving manual content", () => {
		const existing = [
			"# World Index",
			"",
			"Manual introduction.",
			"",
			"## Locations",
			"",
			"<!-- otherworld:index:location:start -->",
			"",
			"- [[Old]]",
			"",
			"<!-- otherworld:index:location:end -->",
			"",
			"Manual notes after locations.",
			"",
		].join("\n");

		const merged = mergeIndexDocument(existing, {
			title: "World Index",
			sections: {
				...createEmptyIndexSections(),
				location: [node("[[Aldmere]]", "Aldmere")],
			},
			warningGroups: [],
		});

		expect(merged).toContain("Manual introduction.");
		expect(merged).toContain("Manual notes after locations.");
		expect(merged).toContain("- [[Aldmere]]");
		expect(merged).not.toContain("- [[Old]]");
		expectNoGeneratedMarkers(merged);
	});

	it("preserves manual blank lines outside replaced marker blocks", () => {
		const existing = [
			"# World Index",
			"",
			"Manual paragraph A.",
			"",
			"",
			"Manual paragraph B.",
			"",
			"## Locations",
			"",
			"<!-- otherworld:index:location:start -->",
			"",
			"- [[Old]]",
			"",
			"<!-- otherworld:index:location:end -->",
			"",
		].join("\n");

		const merged = mergeIndexDocument(existing, {
			title: "World Index",
			sections: {
				...createEmptyIndexSections(),
				location: [node("[[Aldmere]]", "Aldmere")],
			},
			warningGroups: [],
		});

		expect(merged).toContain("Manual paragraph A.\n\n\nManual paragraph B.");
		expect(merged).toContain("- [[Aldmere]]");
		expect(merged).not.toContain("- [[Old]]");
		expectNoGeneratedMarkers(merged);
	});

	it("replaces generated section content under existing headers", () => {
		const existing = [
			"# World Index",
			"",
			"## Events",
			"",
			"- [[Old Battle]]",
			"",
			"## Notes",
			"",
			"Manual event notes.",
			"",
		].join("\n");

		const merged = mergeIndexDocument(existing, {
			title: "World Index",
			sections: {
				...createEmptyIndexSections(),
				event: [node("[[Battle of Red Ford]]", "Battle of Red Ford")],
			},
			warningGroups: [],
		});

		expect(merged).toContain("## Events\n\n- [[Battle of Red Ford]]");
		expect(merged).toContain("- [[Battle of Red Ford]]");
		expect(merged).not.toContain("- [[Old Battle]]");
		expect(merged).toContain("Manual event notes.");
		expectNoGeneratedMarkers(merged);
	});

	it("inserts generated content under existing trailing headers", () => {
		const merged = mergeIndexDocument("# World Index\n\n## Locations\n", {
			title: "World Index",
			sections: {
				...createEmptyIndexSections(),
				location: [node("[[Aldmere]]", "Aldmere")],
			},
			warningGroups: [],
		});

		expect(merged).toContain("## Locations\n\n- [[Aldmere]]");
		expect(merged.match(/## Locations/g)).toHaveLength(1);
		expectNoGeneratedMarkers(merged);
	});

	it("appends missing sections when no header or markers exist", () => {
		const merged = mergeIndexDocument("# World Index\n\nManual only.\n", {
			title: "World Index",
			sections: {
				...createEmptyIndexSections(),
				item: [node("[[Crown of Glass]]", "Crown of Glass")],
			},
			warningGroups: [],
		});

		expect(merged).toContain("Manual only.");
		expect(merged).toContain("## Items");
		expect(merged).toContain("- [[Crown of Glass]]");
		expectNoGeneratedMarkers(merged);
	});

	it("rejects malformed generated markers", () => {
		const existing = [
			"# World Index",
			"",
			"<!-- otherworld:index:location:start -->",
			"",
			"<!-- otherworld:index:event:start -->",
			"",
			"<!-- otherworld:index:location:end -->",
			"",
			"<!-- otherworld:index:event:end -->",
			"",
		].join("\n");

		expect(() => mergeIndexDocument(existing, {
			title: "World Index",
			sections: createEmptyIndexSections(),
			warningGroups: [],
		})).toThrow(MALFORMED_INDEX_MARKERS_MESSAGE);
	});

	it("rejects duplicated generated marker pairs", () => {
		const existing = [
			"# World Index",
			"",
			"<!-- otherworld:index:location:start -->",
			"",
			"- [[Aldmere]]",
			"",
			"<!-- otherworld:index:location:end -->",
			"",
			"<!-- otherworld:index:location:start -->",
			"",
			"- [[Valoria]]",
			"",
			"<!-- otherworld:index:location:end -->",
			"",
		].join("\n");

		expect(() => mergeIndexDocument(existing, {
			title: "World Index",
			sections: createEmptyIndexSections(),
			warningGroups: [],
		})).toThrow(MALFORMED_INDEX_MARKERS_MESSAGE);
	});

	it("rejects reversed generated markers", () => {
		const existing = [
			"# World Index",
			"",
			"<!-- otherworld:index:location:end -->",
			"",
			"<!-- otherworld:index:location:start -->",
			"",
		].join("\n");

		expect(() => mergeIndexDocument(existing, {
			title: "World Index",
			sections: createEmptyIndexSections(),
			warningGroups: [],
		})).toThrow(MALFORMED_INDEX_MARKERS_MESSAGE);
	});

	it("rejects generated markers with missing counterparts", () => {
		const existing = [
			"# World Index",
			"",
			"<!-- otherworld:index:location:start -->",
			"",
		].join("\n");

		expect(() => mergeIndexDocument(existing, {
			title: "World Index",
			sections: createEmptyIndexSections(),
			warningGroups: [],
		})).toThrow(MALFORMED_INDEX_MARKERS_MESSAGE);
	});

	it("rejects generated markers with invalid keys", () => {
		const existing = [
			"# World Index",
			"",
			"<!-- otherworld:index:place:start -->",
			"",
			"<!-- otherworld:index:place:end -->",
			"",
		].join("\n");

		expect(() => mergeIndexDocument(existing, {
			title: "World Index",
			sections: createEmptyIndexSections(),
			warningGroups: [],
		})).toThrow(MALFORMED_INDEX_MARKERS_MESSAGE);
	});

	it("rejects generated markers with invalid directions", () => {
		const existing = [
			"# World Index",
			"",
			"<!-- otherworld:index:location:begin -->",
			"",
		].join("\n");

		expect(() => mergeIndexDocument(existing, {
			title: "World Index",
			sections: createEmptyIndexSections(),
			warningGroups: [],
		})).toThrow(MALFORMED_INDEX_MARKERS_MESSAGE);
	});

	it("rejects truncated generated marker starts", () => {
		for (const marker of [
			"<!-- otherworld:index:location:start ->",
			"<!-- otherworld:index:location:start",
		]) {
			const existing = [
				"# World Index",
				"",
				marker,
				"",
			].join("\n");

			expect(() => mergeIndexDocument(existing, {
				title: "World Index",
				sections: createEmptyIndexSections(),
				warningGroups: [],
			})).toThrow(MALFORMED_INDEX_MARKERS_MESSAGE);
		}
	});

	it("keeps existing warnings marker section with no current warnings", () => {
		const existing = [
			"# World Index",
			"",
			"## Index warnings",
			"",
			"<!-- otherworld:index:warnings:start -->",
			"",
			"### Missing entity notes",
			"",
			"- [[Old Watchtower]] was missing.",
			"",
			"<!-- otherworld:index:warnings:end -->",
			"",
		].join("\n");

		const merged = mergeIndexDocument(existing, {
			title: "World Index",
			sections: createEmptyIndexSections(),
			warningGroups: [],
		});

		expect(merged).toContain("## Index warnings");
		expect(merged).toContain("## Index warnings\n\nNo index warnings.");
		expect(merged).not.toContain("- [[Old Watchtower]] was missing.");
		expectNoGeneratedMarkers(merged);
	});

	it("clears existing markerless warnings when there are no current warnings", () => {
		const existing = [
			"# World Index",
			"",
			"## Index warnings",
			"",
			"### Missing entity notes",
			"",
			"- [[Old Watchtower]] was missing.",
			"",
		].join("\n");

		const merged = mergeIndexDocument(existing, {
			title: "World Index",
			sections: createEmptyIndexSections(),
			warningGroups: [],
		});

		expect(merged).toContain("## Index warnings\n\nNo index warnings.");
		expect(merged).not.toContain("- [[Old Watchtower]] was missing.");
		expectNoGeneratedMarkers(merged);
	});
});

function node(link: string, label: string, children: MapIndexNode[] = []): MapIndexNode {
	return { link, label, children };
}

function expectNoGeneratedMarkers(document: string): void {
	expect(document).not.toContain("<!-- otherworld:index:");
}
