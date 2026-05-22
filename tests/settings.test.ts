import { describe, expect, it } from "vitest";
import {
	DEFAULT_SETTINGS,
	mergeSettings,
	normalizeVaultFolderPath,
	renderIndexFilenameBase,
} from "../src/settings";

describe("settings", () => {
	it("returns the full default settings shape", () => {
		expect(DEFAULT_SETTINGS).toEqual({
			autoCreateMapMetadataOnImageOpen: false,
			entityFolders: {
				location: "Locations",
				event: "Events",
				person: "People",
				faction: "Factions",
				item: "Items",
			},
			defaultSubtypes: {
				location: "city",
				event: "historical",
				person: "other",
				faction: "other",
				item: "other",
			},
			showPinLabelsByDefault: true,
			parentLocationCreation: "ask",
			indexFilenamePattern: "{{mapName}} Index",
		});
		expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
	});

	it("loads valid saved settings", () => {
		expect(mergeSettings({
			autoCreateMapMetadataOnImageOpen: true,
			entityFolders: {
				location: "/Places/",
				event: "World/Events",
				person: "",
				faction: "Groups",
				item: "Items",
			},
			defaultSubtypes: {
				location: "nation",
				event: "battle",
				person: "",
				faction: "guild",
				item: "artifact",
			},
			showPinLabelsByDefault: false,
			parentLocationCreation: "always",
			indexFilenamePattern: "Index - {{mapName}}",
		})).toEqual({
			autoCreateMapMetadataOnImageOpen: true,
			entityFolders: {
				location: "Places",
				event: "World/Events",
				person: "",
				faction: "Groups",
				item: "Items",
			},
			defaultSubtypes: {
				location: "nation",
				event: "battle",
				person: "",
				faction: "guild",
				item: "artifact",
			},
			showPinLabelsByDefault: false,
			parentLocationCreation: "always",
			indexFilenamePattern: "Index - {{mapName}}",
		});
	});

	it("falls back for invalid saved settings values", () => {
		expect(mergeSettings({
			autoCreateMapMetadataOnImageOpen: "yes",
			entityFolders: {
				location: 42,
				event: " /Events/ ",
			},
			defaultSubtypes: {
				location: "battle",
				event: "battle",
				person: "wizard",
			},
			showPinLabelsByDefault: "false",
			parentLocationCreation: "sometimes",
			indexFilenamePattern: "???",
		})).toEqual({
			...DEFAULT_SETTINGS,
			entityFolders: {
				...DEFAULT_SETTINGS.entityFolders,
				event: "Events",
			},
			defaultSubtypes: {
				...DEFAULT_SETTINGS.defaultSubtypes,
				event: "battle",
			},
		});
	});

	it("falls back for entity folders with unsafe path segments", () => {
		expect(mergeSettings({
			entityFolders: {
				location: ".",
				event: "..",
				person: "../People",
				faction: "Groups/../Secrets",
				item: "",
			},
		}).entityFolders).toEqual({
			...DEFAULT_SETTINGS.entityFolders,
			item: "",
		});
	});

	it("normalizes vault folder paths", () => {
		expect(normalizeVaultFolderPath(" /World//Locations/ ")).toBe("World/Locations");
		expect(normalizeVaultFolderPath("\\World\\Locations\\")).toBe("World/Locations");
		expect(normalizeVaultFolderPath("")).toBe("");
	});

	it("renders index filename bases from patterns", () => {
		expect(renderIndexFilenameBase("{{mapName}} Index", "World")).toBe("World Index");
		expect(renderIndexFilenameBase("Index - {{mapName}}", "World")).toBe("Index - World");
		expect(renderIndexFilenameBase("Indexes/{{mapName}}?", "West/World")).toBe("Indexes West World");
		expect(renderIndexFilenameBase("???", "World")).toBeNull();
		expect(renderIndexFilenameBase("   ", "World")).toBeNull();
	});
});
