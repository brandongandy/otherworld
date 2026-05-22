import { Notice, PluginSettingTab, Setting } from "obsidian";
import type OtherworldPlugin from "./main";
import {
	PARENT_LOCATION_CREATION_MODES,
	normalizeVaultFolderPath,
	renderIndexFilenameBase,
	type ParentLocationCreationMode,
} from "./settings";
import { getPinSubtypes } from "./services/PinSubtypeService";
import { PIN_TYPES, type PinType } from "./services/PinTypeService";

const PIN_TYPE_LABELS: Record<PinType, string> = {
	location: "Location",
	event: "Event",
	person: "Person",
	faction: "Faction",
	item: "Item",
};

const PARENT_MODE_LABELS: Record<ParentLocationCreationMode, string> = {
	never: "Never create",
	ask: "Ask before creating",
	always: "Create automatically",
};

export class OtherworldSettingTab extends PluginSettingTab {
	constructor(private readonly plugin: OtherworldPlugin) {
		super(plugin.app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.renderEntityFolders(containerEl);
		this.renderDefaultSubtypes(containerEl);
		this.renderMapDisplay(containerEl);
		this.renderParentLocations(containerEl);
		this.renderLocationIndex(containerEl);
		this.renderMapOpening(containerEl);
	}

	private renderEntityFolders(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Entity output folders" });

		for (const type of PIN_TYPES) {
			new Setting(containerEl)
				.setName(`${PIN_TYPE_LABELS[type]} folder`)
				.setDesc("Vault-relative folder path. Leave blank to create notes at the vault root.")
				.addText((text) => {
					text
						.setValue(this.plugin.settings.entityFolders[type])
						.onChange(async (value) => {
							this.plugin.settings.entityFolders[type] = normalizeVaultFolderPath(value);
							await this.plugin.saveSettings();
						});
				});
		}
	}

	private renderDefaultSubtypes(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Default subtypes" });

		for (const type of PIN_TYPES) {
			new Setting(containerEl)
				.setName(`Default ${type} subtype`)
				.addDropdown((dropdown) => {
					dropdown.addOption("", "None");

					for (const subtype of getPinSubtypes(type)) {
						dropdown.addOption(subtype, formatLabel(subtype));
					}

					dropdown
						.setValue(this.plugin.settings.defaultSubtypes[type])
						.onChange(async (value) => {
							this.plugin.settings.defaultSubtypes[type] = value;
							await this.plugin.saveSettings();
						});
				});
		}
	}

	private renderMapDisplay(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Map display" });

		new Setting(containerEl)
			.setName("Show pin labels by default")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showPinLabelsByDefault)
					.onChange(async (value) => {
						this.plugin.settings.showPinLabelsByDefault = value;
						await this.plugin.saveSettings();
					});
			});
	}

	private renderParentLocations(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Parent locations" });

		new Setting(containerEl)
			.setName("Parent location creation")
			.addDropdown((dropdown) => {
				for (const mode of PARENT_LOCATION_CREATION_MODES) {
					dropdown.addOption(mode, PARENT_MODE_LABELS[mode]);
				}

				dropdown
					.setValue(this.plugin.settings.parentLocationCreation)
					.onChange(async (value) => {
						if (PARENT_LOCATION_CREATION_MODES.includes(value as ParentLocationCreationMode)) {
							this.plugin.settings.parentLocationCreation = value as ParentLocationCreationMode;
							await this.plugin.saveSettings();
						}
					});
			});
	}

	private renderLocationIndex(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Location index" });

		new Setting(containerEl)
			.setName("Index filename pattern")
			.setDesc("Use {{mapName}} for the current map name. The .md extension is added during index generation.")
			.addText((text) => {
				text
					.setValue(this.plugin.settings.indexFilenamePattern)
					.onChange(async (value) => {
						const pattern = value.trim();
						if (!renderIndexFilenameBase(pattern, "World")) {
							new Notice("Index filename pattern must produce a filename.");
							return;
						}

						this.plugin.settings.indexFilenamePattern = pattern;
						await this.plugin.saveSettings();
					});
			});
	}

	private renderMapOpening(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Map opening" });

		new Setting(containerEl)
			.setName("Automatically create map note when opening matching map image")
			.setDesc("When enabled, opening a same-name map image creates the missing map note before opening the map view.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.autoCreateMapMetadataOnImageOpen)
					.onChange(async (value) => {
						this.plugin.settings.autoCreateMapMetadataOnImageOpen = value;
						await this.plugin.saveSettings();
					});
			});
	}
}

function formatLabel(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
