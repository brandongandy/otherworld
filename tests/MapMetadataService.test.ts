import { describe, expect, it } from "vitest";
import { parseMapMetadata } from "../src/services/MapMetadataService";

describe("parseMapMetadata", () => {
	it("parses valid pins from canonical worldbuildingMap frontmatter", () => {
		const metadata = parseMapMetadata({
			worldbuildingMap: {
				image: "World.png",
				coordinateSystem: "normalizedImage",
				pins: [
					{
						id: "world__location__harbor_gate",
						name: "Harbor Gate",
						link: "[[Harbor Gate]]",
						entityPath: "World/Settlements/Harbor Gate.md",
						type: "location",
						subtype: "town",
						parentLocation: "[[Coast Road]]",
						nation: "[[Valoria]]",
						region: "[[Western Coast]]",
						x: 0.5,
						y: 0.45,
					},
				],
			},
		});

		expect(metadata).toEqual({
			pins: [
				{
					id: "world__location__harbor_gate",
					name: "Harbor Gate",
					link: "[[Harbor Gate]]",
					entityPath: "World/Settlements/Harbor Gate.md",
					type: "location",
					subtype: "town",
					parentLocation: "[[Coast Road]]",
					nation: "[[Valoria]]",
					region: "[[Western Coast]]",
					x: 0.5,
					y: 0.45,
				},
			],
		});
	});

	it("skips malformed pins and preserves valid pins", () => {
		const metadata = parseMapMetadata({
			worldbuildingMap: {
				pins: [
					"bad",
					{
						id: "missing-entity-path",
						name: "Missing Entity Path",
						link: "[[Missing Entity Path]]",
						x: 0.4,
						y: 0.5,
					},
					{
						id: "out-of-range",
						name: "Out Of Range",
						link: "[[Out Of Range]]",
						entityPath: "World/Out Of Range.md",
						x: 1.5,
						y: 0.5,
					},
					{
						id: "valid",
						name: "Valid",
						link: "[[Valid]]",
						entityPath: "World/Valid.md",
						x: 0,
						y: 1,
					},
				],
			},
		});

		expect(metadata.pins).toEqual([
			{
				id: "valid",
				name: "Valid",
				link: "[[Valid]]",
				entityPath: "World/Valid.md",
				x: 0,
				y: 1,
			},
		]);
	});

	it("returns an empty pin list when pins is not an array", () => {
		expect(parseMapMetadata({ worldbuildingMap: { pins: "not an array" } })).toEqual({ pins: [] });
		expect(parseMapMetadata(undefined)).toEqual({ pins: [] });
	});
});
