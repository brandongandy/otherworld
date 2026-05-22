import { Modal, Notice, Setting, type App, type ButtonComponent, type DropdownComponent } from "obsidian";
import type { NormalizedPoint } from "../services/MapCoordinateService";
import type {
	CreatePinRequest,
	CreatePinResult,
} from "../services/PinCreationService";
import type { TemplateOption } from "../services/TemplateService";
import { normalizeOptionalText } from "../services/PinMetadataService";
import {
	getPinSubtypes,
	INVALID_PIN_SUBTYPE_MESSAGE,
	isPinSubtype,
	normalizePinSubtype,
} from "../services/PinSubtypeService";
import { isPinType, PIN_TYPES, type PinType } from "../services/PinTypeService";
import type { PinTypeRecord } from "../settings";
import type { ResolvedMap } from "../types";

export interface CreatePinModalOptions {
	map: ResolvedMap;
	point: NormalizedPoint;
	createPin(request: CreatePinRequest): Promise<CreatePinResult>;
	onCreated(result: CreatePinResult): Promise<void> | void;
	templates?: TemplateOption[];
	defaultSubtypes?: PinTypeRecord<string>;
}

export interface CreatePinFormInput {
	name: string;
	type: string;
	subtype?: string;
	parentLocation?: string;
	region?: string;
	nation?: string;
	templatePath?: string;
}

export type CreatePinFormValidation =
	| {
		ok: true;
		value: {
			name: string;
			type: PinType;
			subtype?: string;
			parentLocation?: string;
			region?: string;
			nation?: string;
			templatePath?: string;
		};
	}
	| {
		ok: false;
		error: string;
	};

export class CreatePinModal extends Modal {
	private name = "";
	private type: PinType = "location";
	private subtype = "";
	private parentLocation = "";
	private region = "";
	private nation = "";
	private templatePath = "";
	private hasManualSubtypeSelection = false;
	private hasManualTemplateSelection = false;
	private errorEl: HTMLElement | null = null;
	private createButton: ButtonComponent | null = null;
	private isSaving = false;

	constructor(
		app: App,
		private readonly options: CreatePinModalOptions,
	) {
		super(app);
		this.subtype = readDefaultSubtype("location", options.defaultSubtypes);
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Create map pin" });

		this.errorEl = contentEl.createDiv({ cls: "otherworld-create-pin-modal__error" });

		new Setting(contentEl)
			.setName("Name")
			.addText((text) => {
				text.setPlaceholder("Aldmere");

				if (this.name) {
					text.setValue(this.name);
				}

				text.onChange((value) => {
					this.name = value;
					this.clearError();
				});
			});

		new Setting(contentEl)
			.setName("Type")
			.addDropdown((dropdown) => {
				for (const type of PIN_TYPES) {
					dropdown.addOption(type, formatTypeLabel(type));
				}

				dropdown
					.setValue(this.type)
					.onChange((value) => {
						this.setType(value);
					});
			});

		this.renderSubtypeSetting(contentEl);
		this.renderTemplateSetting(contentEl);

		if (this.type === "location") {
			this.renderLocationHierarchySettings(contentEl);
		}

		new Setting(contentEl)
			.addButton((button) => {
				this.createButton = button;
				button
					.setButtonText("Create pin")
					.setCta()
					.setDisabled(this.isSaving)
					.onClick(() => {
						void this.save();
					});
			});
	}

	private renderSubtypeSetting(contentEl: HTMLElement): void {
		new Setting(contentEl)
			.setName("Subtype")
			.addDropdown((dropdown) => {
				addSubtypeOptions(dropdown, this.type);
				dropdown
					.setValue(this.subtype)
					.onChange((value) => {
						this.hasManualSubtypeSelection = true;
						this.subtype = value;
						this.clearError();
						this.render();
					});
			});
	}

	private renderTemplateSetting(contentEl: HTMLElement): void {
		const templates = this.options.templates ?? [];

		if (templates.length === 0) {
			return;
		}

		if (!this.hasManualTemplateSelection) {
			this.templatePath = selectTemplatePath(templates, this.type, this.subtype);
		}

		new Setting(contentEl)
			.setName("Template")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "None");

				for (const template of templates) {
					dropdown.addOption(template.path, template.name);
				}

				dropdown
					.setValue(this.templatePath)
					.onChange((value) => {
						this.hasManualTemplateSelection = true;
						this.templatePath = value;
						this.clearError();
					});
			});
	}

	private renderLocationHierarchySettings(contentEl: HTMLElement): void {
		new Setting(contentEl)
			.setName("Parent location")
			.addText((text) => {
				if (this.parentLocation) {
					text.setValue(this.parentLocation);
				}

				text.onChange((value) => {
					this.parentLocation = value;
					this.clearError();
				});
			});

		new Setting(contentEl)
			.setName("Region")
			.addText((text) => {
				if (this.region) {
					text.setValue(this.region);
				}

				text.onChange((value) => {
					this.region = value;
					this.clearError();
				});
			});

		new Setting(contentEl)
			.setName("Nation")
			.addText((text) => {
				if (this.nation) {
					text.setValue(this.nation);
				}

				text.onChange((value) => {
					this.nation = value;
					this.clearError();
				});
			});
	}

	private setType(value: string): void {
		if (!isPinType(value)) {
			return;
		}

		this.type = value;

		if (this.hasManualSubtypeSelection) {
			if (!isPinSubtype(this.type, this.subtype)) {
				this.subtype = "";
			}
		} else {
			this.subtype = readDefaultSubtype(this.type, this.options.defaultSubtypes);
		}

		if (this.type !== "location") {
			this.parentLocation = "";
			this.region = "";
			this.nation = "";
		}

		this.clearError();
		this.render();
	}

	private async save(): Promise<void> {
		if (this.isSaving) {
			return;
		}

		const validation = validateCreatePinForm({
			name: this.name,
			type: this.type,
			subtype: this.subtype,
			parentLocation: this.parentLocation,
			region: this.region,
			nation: this.nation,
			templatePath: this.templatePath,
		});

		if (!validation.ok) {
			this.showError(validation.error);
			return;
		}

		this.isSaving = true;
		this.createButton?.setDisabled(true);

		let result: CreatePinResult;
		try {
			const createRequest: CreatePinRequest = {
				map: this.options.map,
				point: this.options.point,
				name: validation.value.name,
				type: validation.value.type,
			};

			if (validation.value.subtype) {
				createRequest.subtype = validation.value.subtype;
			}

			if (validation.value.parentLocation) {
				createRequest.parentLocation = validation.value.parentLocation;
			}

			if (validation.value.region) {
				createRequest.region = validation.value.region;
			}

			if (validation.value.nation) {
				createRequest.nation = validation.value.nation;
			}

			if (validation.value.templatePath) {
				createRequest.templatePath = validation.value.templatePath;
			}

			result = await this.options.createPin(createRequest);
		} catch (error) {
			console.error("Unable to create map pin", error);
			const message = error instanceof Error ? error.message : "Unable to create map pin.";
			this.showError(message);
			new Notice(message);
			this.isSaving = false;
			this.createButton?.setDisabled(false);
			return;
		}

		this.close();

		try {
			await this.options.onCreated(result);
		} catch (error) {
			console.error("Unable to refresh map after creating pin", error);
			new Notice("Created pin, but the map could not refresh.");
		}
	}

	private showError(message: string): void {
		if (this.errorEl) {
			this.errorEl.setText(message);
		}
	}

	private clearError(): void {
		if (this.errorEl) {
			this.errorEl.setText("");
		}
	}
}

export function validateCreatePinForm(input: CreatePinFormInput): CreatePinFormValidation {
	const name = input.name.trim().replace(/\s+/g, " ");

	if (!name) {
		return {
			ok: false,
			error: "Enter a pin name.",
		};
	}

	if (!isPinType(input.type)) {
		return {
			ok: false,
			error: "Choose a supported pin type.",
		};
	}

	let subtype: string | undefined;

	try {
		subtype = normalizePinSubtype(input.type, input.subtype);
	} catch {
		return {
			ok: false,
			error: INVALID_PIN_SUBTYPE_MESSAGE,
		};
	}

	const parentLocation = normalizeOptionalText(input.parentLocation);
	const region = normalizeOptionalText(input.region);
	const nation = normalizeOptionalText(input.nation);
	const templatePath = input.templatePath?.trim();

	if (input.type !== "location" && (parentLocation || region || nation)) {
		return {
			ok: false,
			error: "Location hierarchy fields are only supported for location pins.",
		};
	}

	const value: Extract<CreatePinFormValidation, { ok: true }>["value"] = {
		name,
		type: input.type,
	};

	if (subtype) {
		value.subtype = subtype;
	}

	if (parentLocation) {
		value.parentLocation = parentLocation;
	}

	if (region) {
		value.region = region;
	}

	if (nation) {
		value.nation = nation;
	}

	if (templatePath) {
		value.templatePath = templatePath;
	}

	return {
		ok: true,
		value,
	};
}

function addSubtypeOptions(dropdown: DropdownComponent, type: PinType): void {
	dropdown.addOption("", "None");

	for (const subtype of getPinSubtypes(type)) {
		dropdown.addOption(subtype, formatTypeLabel(subtype));
	}
}

function readDefaultSubtype(type: PinType, defaultSubtypes: PinTypeRecord<string> | undefined): string {
	const subtype = defaultSubtypes?.[type] ?? "";
	return isPinSubtype(type, subtype) ? subtype : "";
}

function selectTemplatePath(templates: TemplateOption[], type: PinType, subtype: string): string {
	const typeName = formatTemplateMatchName(type);
	const subtypeName = subtype ? formatTemplateMatchName(subtype) : "";
	const templateNames = subtypeName ? [`${typeName} - ${subtypeName}`, typeName] : [typeName];

	for (const templateName of templateNames) {
		const template = templates.find((option) => normalizeTemplateName(option.name) === normalizeTemplateName(templateName));

		if (template) {
			return template.path;
		}
	}

	return "";
}

function normalizeTemplateName(name: string): string {
	return name.trim().toLowerCase();
}

function formatTemplateMatchName(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTypeLabel(type: string): string {
	return type.charAt(0).toUpperCase() + type.slice(1);
}
