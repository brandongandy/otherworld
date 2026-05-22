import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type OtherworldSettings } from "../src/settings";
import { OtherworldSettingTab } from "../src/settingsTab";
import {
	getMockNotices,
	getMockDropdownComponents,
	getMockSettings,
	getMockTextComponents,
	getMockToggleComponents,
	resetObsidianMocks,
	type MockDropdownComponent,
	type MockTextComponent,
	type MockToggleComponent,
} from "./mocks/obsidian";

describe("OtherworldSettingTab", () => {
	beforeEach(() => {
		resetObsidianMocks();
	});

	it("renders grouped Phase 5 settings", () => {
		const { tab } = createSettingTab();

		tab.display();

		expect(getMockSettings().map((setting) => setting.name)).toEqual([
			"Location folder",
			"Event folder",
			"Person folder",
			"Faction folder",
			"Item folder",
			"Default location subtype",
			"Default event subtype",
			"Default person subtype",
			"Default faction subtype",
			"Default item subtype",
			"Show pin labels by default",
			"Parent location creation",
			"Index filename pattern",
			"Automatically create map note when opening matching map image",
		]);
	});

	it("saves entity folder text changes", () => {
		const { plugin, tab } = createSettingTab();
		tab.display();

		getTextForSetting("Location folder")?.setValue("World/Places");

		expect(plugin.settings.entityFolders.location).toBe("World/Places");
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});

	it("saves default subtype dropdown changes", () => {
		const { plugin, tab } = createSettingTab();
		tab.display();

		getDropdownForSetting("Default location subtype")?.setSelectedValue("nation");
		getDropdownForSetting("Default person subtype")?.setSelectedValue("");

		expect(plugin.settings.defaultSubtypes.location).toBe("nation");
		expect(plugin.settings.defaultSubtypes.person).toBe("");
		expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
	});

	it("renders None plus supported subtype choices", () => {
		const { tab } = createSettingTab();
		tab.display();

		expect(getDropdownForSetting("Default event subtype")?.options).toEqual([
			{ value: "", label: "None" },
			{ value: "historical", label: "Historical" },
			{ value: "story", label: "Story" },
			{ value: "battle", label: "Battle" },
			{ value: "disaster", label: "Disaster" },
			{ value: "founding", label: "Founding" },
		]);
	});

	it("saves display, parent creation, index, and map opening settings", () => {
		const { plugin, tab } = createSettingTab();
		tab.display();

		getToggleForSetting("Show pin labels by default")?.setSelectedValue(false);
		getDropdownForSetting("Parent location creation")?.setSelectedValue("always");
		getTextForSetting("Index filename pattern")?.setValue("Index - {{mapName}}");
		getToggleForSetting("Automatically create map note when opening matching map image")?.setSelectedValue(true);

		expect(plugin.settings.showPinLabelsByDefault).toBe(false);
		expect(plugin.settings.parentLocationCreation).toBe("always");
		expect(plugin.settings.indexFilenamePattern).toBe("Index - {{mapName}}");
		expect(plugin.settings.autoCreateMapMetadataOnImageOpen).toBe(true);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(4);
	});

	it("rejects invalid index filename patterns without saving", () => {
		const { plugin, tab } = createSettingTab();
		tab.display();

		getTextForSetting("Index filename pattern")?.setValue("???");

		expect(plugin.settings.indexFilenamePattern).toBe("{{mapName}} Index");
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(getMockNotices()).toContain("Index filename pattern must produce a filename.");
	});
});

function createSettingTab(): {
	plugin: {
		app: unknown;
		settings: OtherworldSettings;
		saveSettings: ReturnType<typeof vi.fn>;
	};
	tab: OtherworldSettingTab;
} {
	const plugin = {
		app: {},
		settings: structuredClone(DEFAULT_SETTINGS),
		saveSettings: vi.fn(async () => undefined),
	};

	return {
		plugin,
		tab: new OtherworldSettingTab(plugin as never),
	};
}

function getTextForSetting(name: string): MockTextComponent | undefined {
	const index = getSettingIndex(name);
	if (index === -1) {
		return undefined;
	}

	const textIndex = getMockSettings()
		.slice(0, index + 1)
		.filter((setting) => TEXT_SETTING_NAMES.has(setting.name))
		.length - 1;
	return getMockTextComponents()[textIndex];
}

function getDropdownForSetting(name: string): MockDropdownComponent | undefined {
	const index = getSettingIndex(name);
	if (index === -1) {
		return undefined;
	}

	const dropdownIndex = getMockSettings()
		.slice(0, index + 1)
		.filter((setting) => DROPDOWN_SETTING_NAMES.has(setting.name))
		.length - 1;
	return getMockDropdownComponents()[dropdownIndex];
}

function getToggleForSetting(name: string): MockToggleComponent | undefined {
	const index = getSettingIndex(name);
	if (index === -1) {
		return undefined;
	}

	const toggleIndex = getMockSettings()
		.slice(0, index + 1)
		.filter((setting) => TOGGLE_SETTING_NAMES.has(setting.name))
		.length - 1;
	return getMockToggleComponents()[toggleIndex];
}

function getSettingIndex(name: string): number {
	return getMockSettings().findIndex((setting) => setting.name === name);
}

const TEXT_SETTING_NAMES = new Set([
	"Location folder",
	"Event folder",
	"Person folder",
	"Faction folder",
	"Item folder",
	"Index filename pattern",
]);

const DROPDOWN_SETTING_NAMES = new Set([
	"Default location subtype",
	"Default event subtype",
	"Default person subtype",
	"Default faction subtype",
	"Default item subtype",
	"Parent location creation",
]);

const TOGGLE_SETTING_NAMES = new Set([
	"Show pin labels by default",
	"Automatically create map note when opening matching map image",
]);
