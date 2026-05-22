import { describe, expect, it, vi } from "vitest";
import {
	buildWikiLink,
	readWikiLinkDisplayText,
	readWikiLinkTarget,
	wikiLinkKey,
} from "../src/services/WikiLinkService";

describe("WikiLinkService", () => {
	it("reads targets from plain paths and wikilinks", () => {
		expect(readWikiLinkTarget("Aldmere")).toBe("Aldmere");
		expect(readWikiLinkTarget("[[Aldmere]]")).toBe("Aldmere");
		expect(readWikiLinkTarget("[[Aldmere|The City]]")).toBe("Aldmere");
		expect(readWikiLinkTarget("[[Locations/Aldmere.md|The City]]")).toBe("Locations/Aldmere.md");
		expect(readWikiLinkTarget("[[Harbor  Gate]]")).toBe("Harbor  Gate");
		expect(readWikiLinkTarget("[[Locations\\Aldmere.md]]")).toBe("Locations/Aldmere.md");
	});

	it("reads display text from wikilinks and aliases", () => {
		expect(readWikiLinkDisplayText("[[Aldmere]]")).toBe("Aldmere");
		expect(readWikiLinkDisplayText("[[Aldmere|The City]]")).toBe("The City");
		expect(readWikiLinkDisplayText("[[Aldmere|  The City  ]]")).toBe("  The City  ");
		expect(readWikiLinkDisplayText("[[Places/Aldmere|Old/Name.md]]")).toBe("Old/Name.md");
		expect(readWikiLinkDisplayText("Locations/Aldmere.md")).toBe("Aldmere");
	});

	it("builds safe wikilinks", () => {
		expect(buildWikiLink("Aldmere")).toBe("[[Aldmere]]");
		expect(buildWikiLink("[[Aldmere]]")).toBe("[[Aldmere]]");
		expect(buildWikiLink(" Locations/Aldmere.md ")).toBe("[[Locations/Aldmere]]");
	});

	it("builds stable dedupe keys", () => {
		expect(wikiLinkKey("[[Aldmere]]")).toBe("aldmere");
		expect(wikiLinkKey("[[Aldmere|The City]]")).toBe("aldmere");
		expect(wikiLinkKey("Locations/Aldmere.md")).toBe("locations/aldmere");
	});

	it("builds dedupe keys without locale-sensitive casing", () => {
		const localeLowerCase = vi
			.spyOn(String.prototype, "toLocaleLowerCase")
			.mockReturnValue("locale-specific");

		try {
			expect(wikiLinkKey("[[Aldmere]]")).toBe("aldmere");
		} finally {
			localeLowerCase.mockRestore();
		}
	});
});
