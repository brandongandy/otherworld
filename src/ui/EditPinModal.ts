import { Modal, Notice, Setting, type App, type ButtonComponent, type DropdownComponent } from "obsidian";
import type { EditPinRequest, EditPinResult } from "../services/PinEditService";
import { normalizeOptionalText } from "../services/PinMetadataService";
import {
	getPinSubtypes,
	INVALID_PIN_SUBTYPE_MESSAGE,
	isPinSubtype,
	normalizePinSubtype,
} from "../services/PinSubtypeService";
import { isPinType, PIN_TYPES, type PinType } from "../services/PinTypeService";
import type { MapPin, ResolvedMap } from "../types";

export interface EditPinModalOptions {
	map: ResolvedMap;
	pin: MapPin;
	savePin(request: EditPinRequest): Promise<EditPinResult>;
	onSaved(result: EditPinResult): Promise<void> | void;
}

export interface EditPinFormInput {
	name: string;
	type: string;
	subtype?: string;
	x: string;
	y: string;
	parentLocation?: string;
	region?: string;
	nation?: string;
}

export type EditPinFormValidation =
	| {
		ok: true;
		value: {
			name: string;
			type: PinType;
			subtype?: string;
			x: number;
			y: number;
			parentLocation?: string;
			region?: string;
			nation?: string;
		};
	}
	| {
		ok: false;
		error: string;
	};

export class EditPinModal extends Modal {
	private name: string;
	private type: PinType;
	private subtype: string;
	private x: string;
	private y: string;
	private parentLocation: string;
	private region: string;
	private nation: string;
	private errorEl: HTMLElement | null = null;
	private saveButton: ButtonComponent | null = null;
	private isSaving = false;

	constructor(
		app: App,
		private readonly options: EditPinModalOptions,
	) {
		super(app);
		this.name = options.pin.name;
		this.type = isPinType(options.pin.type) ? options.pin.type : "location";
		this.subtype = options.pin.subtype ?? "";
		this.x = String(options.pin.x);
		this.y = String(options.pin.y);
		this.parentLocation = options.pin.parentLocation ?? "";
		this.region = options.pin.region ?? "";
		this.nation = options.pin.nation ?? "";
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
		contentEl.createEl("h2", { text: "Edit map pin" });
		this.errorEl = contentEl.createDiv({ cls: "otherworld-edit-pin-modal__error" });

		new Setting(contentEl)
			.setName("Name")
			.addText((text) => {
				text.setValue(this.name);
				text.onChange((value) => {
					this.name = value;
					this.clearError();
				});
			});

		new Setting(contentEl)
			.setName("Linked note")
			.setDesc(this.options.pin.entityPath);

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
		this.renderCoordinateSettings(contentEl);

		if (this.type === "location") {
			this.renderLocationHierarchySettings(contentEl);
		}

		new Setting(contentEl)
			.addButton((button) => {
				this.saveButton = button;
				button
					.setButtonText("Save pin")
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
						this.subtype = value;
						this.clearError();
					});
			});
	}

	private renderCoordinateSettings(contentEl: HTMLElement): void {
		new Setting(contentEl)
			.setName("X")
			.addText((text) => {
				text.setValue(this.x);
				text.onChange((value) => {
					this.x = value;
					this.clearError();
				});
			});

		new Setting(contentEl)
			.setName("Y")
			.addText((text) => {
				text.setValue(this.y);
				text.onChange((value) => {
					this.y = value;
					this.clearError();
				});
			});
	}

	private renderLocationHierarchySettings(contentEl: HTMLElement): void {
		new Setting(contentEl)
			.setName("Parent location")
			.addText((text) => {
				text.setValue(this.parentLocation);
				text.onChange((value) => {
					this.parentLocation = value;
					this.clearError();
				});
			});

		new Setting(contentEl)
			.setName("Region")
			.addText((text) => {
				text.setValue(this.region);
				text.onChange((value) => {
					this.region = value;
					this.clearError();
				});
			});

		new Setting(contentEl)
			.setName("Nation")
			.addText((text) => {
				text.setValue(this.nation);
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

		if (!isPinSubtype(this.type, this.subtype)) {
			this.subtype = "";
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

		const validation = validateEditPinForm({
			name: this.name,
			type: this.type,
			subtype: this.subtype,
			x: this.x,
			y: this.y,
			parentLocation: this.parentLocation,
			region: this.region,
			nation: this.nation,
		});

		if (!validation.ok) {
			this.showError(validation.error);
			return;
		}

		this.isSaving = true;
		this.saveButton?.setDisabled(true);

		let result: EditPinResult;
		try {
			const editRequest: EditPinRequest = {
				map: this.options.map,
				pin: this.options.pin,
				name: validation.value.name,
				type: validation.value.type,
				x: validation.value.x,
				y: validation.value.y,
			};

			if (validation.value.subtype) {
				editRequest.subtype = validation.value.subtype;
			}

			if (validation.value.parentLocation) {
				editRequest.parentLocation = validation.value.parentLocation;
			}

			if (validation.value.region) {
				editRequest.region = validation.value.region;
			}

			if (validation.value.nation) {
				editRequest.nation = validation.value.nation;
			}

			result = await this.options.savePin(editRequest);
		} catch (error) {
			console.error("Unable to edit map pin", error);
			const message = error instanceof Error ? error.message : "Unable to edit map pin.";
			this.showError(message);
			new Notice(message);
			this.isSaving = false;
			this.saveButton?.setDisabled(false);
			return;
		}

		this.close();

		try {
			await this.options.onSaved(result);
		} catch (error) {
			console.error("Unable to refresh map after editing pin", error);
			new Notice("Saved pin, but the map could not refresh.");
		}
	}

	private showError(message: string): void {
		this.errorEl?.setText(message);
	}

	private clearError(): void {
		this.errorEl?.setText("");
	}
}

export function validateEditPinForm(input: EditPinFormInput): EditPinFormValidation {
	const name = normalizeOptionalText(input.name);

	if (!name) {
		return { ok: false, error: "Enter a pin name." };
	}

	if (!isPinType(input.type)) {
		return { ok: false, error: "Choose a supported pin type." };
	}

	let subtype: string | undefined;
	try {
		subtype = normalizePinSubtype(input.type, input.subtype);
	} catch {
		return { ok: false, error: INVALID_PIN_SUBTYPE_MESSAGE };
	}

	const x = Number(input.x);
	const y = Number(input.y);

	if (!isNormalizedCoordinate(x) || !isNormalizedCoordinate(y)) {
		return {
			ok: false,
			error: "Pin coordinates must be normalized values from 0 to 1.",
		};
	}

	const parentLocation = normalizeOptionalText(input.parentLocation);
	const region = normalizeOptionalText(input.region);
	const nation = normalizeOptionalText(input.nation);

	if (input.type !== "location" && (parentLocation || region || nation)) {
		return {
			ok: false,
			error: "Location hierarchy fields are only supported for location pins.",
		};
	}

	const value: Extract<EditPinFormValidation, { ok: true }>["value"] = {
		name,
		type: input.type,
		x,
		y,
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

	return { ok: true, value };
}

function addSubtypeOptions(dropdown: DropdownComponent, type: PinType): void {
	dropdown.addOption("", "None");

	for (const subtype of getPinSubtypes(type)) {
		dropdown.addOption(subtype, formatTypeLabel(subtype));
	}
}

function isNormalizedCoordinate(value: number): boolean {
	return Number.isFinite(value) && value >= 0 && value <= 1;
}

function formatTypeLabel(type: string): string {
	return type.charAt(0).toUpperCase() + type.slice(1);
}
