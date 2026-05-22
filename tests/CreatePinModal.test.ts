import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatePinResult } from "../src/services/PinCreationService";
import type { TemplateOption } from "../src/services/TemplateService";
import type { ResolvedMap } from "../src/types";
import { CreatePinModal, validateCreatePinForm } from "../src/ui/CreatePinModal";
import {
	getMockButtonComponents,
	getMockDropdownComponents,
	getMockNotices,
	getMockSettings,
	getMockTextComponents,
	type MockDropdownComponent,
	type MockTextComponent,
	resetObsidianMocks,
} from "./mocks/obsidian";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
	resetObsidianMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("validateCreatePinForm", () => {
	it("accepts a trimmed name and supported type", () => {
		expect(validateCreatePinForm({
			name: "  Aldmere  ",
			type: "location",
		})).toEqual({
			ok: true,
			value: {
				name: "Aldmere",
				type: "location",
			},
		});
	});

	it("rejects empty names and invalid types", () => {
		expect(validateCreatePinForm({
			name: " ",
			type: "location",
		})).toEqual({
			ok: false,
			error: "Enter a pin name.",
		});

		expect(validateCreatePinForm({
			name: "Aldmere",
			type: "planet",
		})).toEqual({
			ok: false,
			error: "Choose a supported pin type.",
		});
	});

	it("accepts optional subtype and location hierarchy values", () => {
		expect(validateCreatePinForm({
			name: "Aldmere",
			type: "location",
			subtype: "city",
			parentLocation: " Northern   Marches ",
			region: "Northern Marches",
			nation: " Valoria ",
		})).toEqual({
			ok: true,
			value: {
				name: "Aldmere",
				type: "location",
				subtype: "city",
				parentLocation: "Northern Marches",
				region: "Northern Marches",
				nation: "Valoria",
			},
		});
	});

	it("rejects invalid subtype and non-location hierarchy values", () => {
		expect(validateCreatePinForm({
			name: "Aldmere",
			type: "event",
			subtype: "city",
		})).toEqual({
			ok: false,
			error: "Pin subtype is not supported for the selected type.",
		});

		expect(validateCreatePinForm({
			name: "Aldmere",
			type: "event",
			subtype: "battle",
			parentLocation: "Northern Marches",
		})).toEqual({
			ok: false,
			error: "Location hierarchy fields are only supported for location pins.",
		});
	});
});

describe("CreatePinModal", () => {
	it("initializes subtype from configured defaults", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
			defaultSubtypes: {
				location: "town",
				event: "battle",
				person: "scholar",
				faction: "guild",
				item: "artifact",
			},
		});

		modal.onOpen();

		expect(getDropdownForSetting("Subtype")?.value).toBe("town");
	});

	it("uses the configured subtype default when changing type before manual subtype selection", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
			defaultSubtypes: {
				location: "town",
				event: "battle",
				person: "scholar",
				faction: "guild",
				item: "artifact",
			},
		});

		modal.onOpen();
		getDropdownForSetting("Type")?.setSelectedValue("event");

		expect(getDropdownForSetting("Subtype")?.value).toBe("battle");
	});

	it("preserves manual subtype selection after type changes", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
			defaultSubtypes: {
				location: "town",
				event: "battle",
				person: "scholar",
				faction: "guild",
				item: "artifact",
			},
		});

		modal.onOpen();
		getDropdownForSetting("Subtype")?.setSelectedValue("city");
		getDropdownForSetting("Type")?.setSelectedValue("event");

		expect(getDropdownForSetting("Subtype")?.value).toBe("");
	});

	it("preserves manual subtype selection when it is valid for the new type", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
			defaultSubtypes: {
				location: "town",
				event: "battle",
				person: "scholar",
				faction: "guild",
				item: "artifact",
			},
		});

		modal.onOpen();
		getDropdownForSetting("Type")?.setSelectedValue("person");
		getDropdownForSetting("Subtype")?.setSelectedValue("other");
		getDropdownForSetting("Type")?.setSelectedValue("faction");

		expect(getDropdownForSetting("Subtype")?.value).toBe("other");
	});

	it("hides the template selector when no templates are available", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
			templates: [],
		});

		modal.onOpen();

		expect(getMockSettings().map((setting) => setting.name)).not.toContain("Template");
	});

	it("renders template options when templates are available", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
			templates: createTemplateOptions(),
		});

		modal.onOpen();

		expect(getMockSettings().map((setting) => setting.name)).toContain("Template");
		expect(getDropdownForSetting("Template")?.options).toEqual([
			{ value: "", label: "None" },
			{ value: "Templates/Event.md", label: "Event" },
			{ value: "Templates/Location.md", label: "Location" },
		]);
	});

	it("auto-selects the type and subtype template when available", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
			templates: [
				{ path: "Templates/Location.md", name: "Location" },
				{ path: "Templates/Location - City.md", name: "Location - City" },
			],
		});

		modal.onOpen();
		getDropdownForSetting("Subtype")?.setSelectedValue("city");

		expect(getDropdownForSetting("Template")?.value).toBe("Templates/Location - City.md");
	});

	it("auto-selects the subtype template from the configured default subtype", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
			defaultSubtypes: {
				location: "city",
				event: "battle",
				person: "scholar",
				faction: "guild",
				item: "artifact",
			},
			templates: [
				{ path: "Templates/Location.md", name: "Location" },
				{ path: "Templates/Location - City.md", name: "Location - City" },
			],
		});

		modal.onOpen();

		expect(getDropdownForSetting("Subtype")?.value).toBe("city");
		expect(getDropdownForSetting("Template")?.value).toBe("Templates/Location - City.md");
	});

	it("falls back to the type template when the type and subtype template is absent", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
			templates: [
				{ path: "Templates/Event.md", name: "Event" },
				{ path: "Templates/Location.md", name: "Location" },
			],
		});

		modal.onOpen();
		getDropdownForSetting("Subtype")?.setSelectedValue("city");

		expect(getDropdownForSetting("Template")?.value).toBe("Templates/Location.md");
	});

	it("auto-selects the type template when type changes without a subtype", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
			templates: createTemplateOptions(),
		});

		modal.onOpen();
		getDropdownForSetting("Type")?.setSelectedValue("event");

		expect(getDropdownForSetting("Template")?.value).toBe("Templates/Event.md");
	});

	it("matches template names case-insensitively when auto-selecting", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
			templates: [
				{ path: "Templates/location - city.md", name: "location - city" },
				{ path: "Templates/Location.md", name: "Location" },
			],
		});

		modal.onOpen();
		getDropdownForSetting("Subtype")?.setSelectedValue("city");

		expect(getDropdownForSetting("Template")?.value).toBe("Templates/location - city.md");
	});

	it("preserves a manually selected template after type and subtype changes", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
			templates: [
				{ path: "Templates/Custom.md", name: "Custom" },
				{ path: "Templates/Event.md", name: "Event" },
				{ path: "Templates/Location - City.md", name: "Location - City" },
				{ path: "Templates/Location.md", name: "Location" },
			],
		});

		modal.onOpen();
		getDropdownForSetting("Template")?.setSelectedValue("Templates/Custom.md");
		getDropdownForSetting("Subtype")?.setSelectedValue("city");
		expect(getDropdownForSetting("Template")?.value).toBe("Templates/Custom.md");

		getDropdownForSetting("Type")?.setSelectedValue("event");
		expect(getDropdownForSetting("Template")?.value).toBe("Templates/Custom.md");
	});

	it("preserves a manual None template selection after type and subtype changes", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
			templates: [
				{ path: "Templates/Event.md", name: "Event" },
				{ path: "Templates/Location - City.md", name: "Location - City" },
				{ path: "Templates/Location.md", name: "Location" },
			],
		});

		modal.onOpen();
		getDropdownForSetting("Template")?.setSelectedValue("");
		getDropdownForSetting("Subtype")?.setSelectedValue("city");
		expect(getDropdownForSetting("Template")?.value).toBe("");

		getDropdownForSetting("Type")?.setSelectedValue("event");
		expect(getDropdownForSetting("Template")?.value).toBe("");
	});

	it("submits the selected template path", async () => {
		const createPin = vi.fn().mockResolvedValue(createPinResult());
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin,
			onCreated: vi.fn(),
			templates: createTemplateOptions(),
		});

		modal.onOpen();
		getTextForSetting("Name")?.setValue("Aldmere");
		getDropdownForSetting("Template")?.setSelectedValue("Templates/Location.md");
		getMockButtonComponents()[0]?.click();
		await flushPromises();

		expect(createPin).toHaveBeenCalledWith({
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			name: "Aldmere",
			type: "location",
			templatePath: "Templates/Location.md",
		});
	});

	it("submits the auto-selected type template path", async () => {
		const createPin = vi.fn().mockResolvedValue(createPinResult());
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin,
			onCreated: vi.fn(),
			templates: createTemplateOptions(),
		});

		modal.onOpen();
		getTextForSetting("Name")?.setValue("Aldmere");
		getMockButtonComponents()[0]?.click();
		await flushPromises();

		expect(createPin).toHaveBeenCalledWith({
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			name: "Aldmere",
			type: "location",
			templatePath: "Templates/Location.md",
		});
	});

	it("omits template path when manual None overrides the auto-selected template", async () => {
		const createPin = vi.fn().mockResolvedValue(createPinResult());
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin,
			onCreated: vi.fn(),
			templates: createTemplateOptions(),
		});

		modal.onOpen();
		expect(getDropdownForSetting("Template")?.value).toBe("Templates/Location.md");
		getDropdownForSetting("Template")?.setSelectedValue("");
		getTextForSetting("Name")?.setValue("Aldmere");
		getMockButtonComponents().at(-1)?.click();
		await flushPromises();

		expect(createPin).toHaveBeenCalledWith({
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			name: "Aldmere",
			type: "location",
		});
	});

	it("preserves the selected template path after type changes re-render the modal", async () => {
		const createPin = vi.fn().mockResolvedValue(createPinResult());
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin,
			onCreated: vi.fn(),
			templates: createTemplateOptions(),
		});

		modal.onOpen();
		getTextForSetting("Name")?.setValue("Aldmere");
		getDropdownForSetting("Template")?.setSelectedValue("Templates/Location.md");
		getDropdownForSetting("Type")?.setSelectedValue("event");
		expect(getDropdownForSetting("Template")?.value).toBe("Templates/Location.md");
		getMockButtonComponents().at(-1)?.click();
		await flushPromises();

		expect(createPin).toHaveBeenCalledWith({
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			name: "Aldmere",
			type: "event",
			templatePath: "Templates/Location.md",
		});
	});

	it("renders subtype options for the selected type", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
		});

		modal.onOpen();

		expect(getMockSettings().map((setting) => setting.name)).toContain("Subtype");
		expect(getMockDropdownComponents()[1]?.options).toEqual([
			{ value: "", label: "None" },
			{ value: "city", label: "City" },
			{ value: "town", label: "Town" },
			{ value: "burg", label: "Burg" },
			{ value: "capital", label: "Capital" },
			{ value: "ruin", label: "Ruin" },
			{ value: "landmark", label: "Landmark" },
			{ value: "region", label: "Region" },
			{ value: "nation", label: "Nation" },
			{ value: "province", label: "Province" },
			{ value: "continent", label: "Continent" },
		]);
	});

	it("updates subtype options and clears hierarchy fields when type changes away from location", () => {
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin: vi.fn(),
			onCreated: vi.fn(),
		});

		modal.onOpen();
		getDropdownForSetting("Subtype")?.setSelectedValue("city");
		getTextForSetting("Parent location")?.setValue("Northern Marches");
		getTextForSetting("Region")?.setValue("Northern Marches");
		getTextForSetting("Nation")?.setValue("Valoria");
		getDropdownForSetting("Type")?.setSelectedValue("event");

		const newestSubtypeDropdown = getMockDropdownComponents().at(-1);
		const newestSettingNames = getMockSettings()
			.slice(-4)
			.map((setting) => setting.name);

		expect(newestSubtypeDropdown?.options).toEqual([
			{ value: "", label: "None" },
			{ value: "historical", label: "Historical" },
			{ value: "story", label: "Story" },
			{ value: "battle", label: "Battle" },
			{ value: "disaster", label: "Disaster" },
			{ value: "founding", label: "Founding" },
		]);
		expect(newestSettingNames).not.toContain("Parent location");
	});

	it("submits subtype and hierarchy values for location pins", async () => {
		const createPin = vi.fn().mockResolvedValue(createPinResult());
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin,
			onCreated: vi.fn(),
		});

		modal.onOpen();
		getTextForSetting("Name")?.setValue("Aldmere");
		getDropdownForSetting("Subtype")?.setSelectedValue("city");
		getTextForSetting("Parent location")?.setValue("Northern Marches");
		getTextForSetting("Region")?.setValue("Northern Marches");
		getTextForSetting("Nation")?.setValue("Valoria");
		getMockButtonComponents().at(-1)?.click();
		await flushPromises();

		expect(createPin).toHaveBeenCalledWith({
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			name: "Aldmere",
			type: "location",
			subtype: "city",
			parentLocation: "Northern Marches",
			region: "Northern Marches",
			nation: "Valoria",
		});
	});

	it("does not submit hierarchy values for non-location pins", async () => {
		const createPin = vi.fn().mockResolvedValue(createPinResult());
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin,
			onCreated: vi.fn(),
		});

		modal.onOpen();
		getTextForSetting("Name")?.setValue("Battle of Red Ford");
		getDropdownForSetting("Type")?.setSelectedValue("event");
		getDropdownForSetting("Subtype")?.setSelectedValue("battle");
		getMockButtonComponents().at(-1)?.click();
		await flushPromises();

		expect(createPin).toHaveBeenCalledWith({
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			name: "Battle of Red Ford",
			type: "event",
			subtype: "battle",
		});
	});

	it("clears stale hierarchy values before saving after switching from location to event", async () => {
		const createPin = vi.fn().mockResolvedValue(createPinResult());
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin,
			onCreated: vi.fn(),
		});

		modal.onOpen();
		getTextForSetting("Name")?.setValue("Battle of Red Ford");
		getDropdownForSetting("Subtype")?.setSelectedValue("city");
		getTextForSetting("Parent location")?.setValue("Northern Marches");
		getTextForSetting("Region")?.setValue("Northern Marches");
		getTextForSetting("Nation")?.setValue("Valoria");
		getDropdownForSetting("Type")?.setSelectedValue("event");
		getDropdownForSetting("Subtype")?.setSelectedValue("battle");
		getMockButtonComponents().at(-1)?.click();
		await flushPromises();

		expect(createPin).toHaveBeenCalledWith({
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			name: "Battle of Red Ford",
			type: "event",
			subtype: "battle",
		});
	});

	it("closes after createPin succeeds even if onCreated fails", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const result = createPinResult();
		const createPin = vi.fn().mockResolvedValue(result);
		const onCreated = vi.fn().mockRejectedValue(new Error("Refresh failed."));
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin,
			onCreated,
		});

		modal.onOpen();
		getTextForSetting("Name")?.setValue("Aldmere");
		getMockButtonComponents()[0]?.click();
		await flushPromises();

		expect(createPin).toHaveBeenCalledTimes(1);
		expect(onCreated).toHaveBeenCalledWith(result);
		expect(modal.closed).toBe(true);
		expect(readErrorText(modal)).toBe("");
		expect(getMockNotices()).toContain("Created pin, but the map could not refresh.");
		expect(consoleError).toHaveBeenCalledWith("Unable to refresh map after creating pin", expect.any(Error));
		expect(consoleError).not.toHaveBeenCalledWith("Unable to create map pin", expect.any(Error));
	});

	it("ignores duplicate create clicks while save is pending", async () => {
		const deferred = createDeferred<CreatePinResult>();
		const createPin = vi.fn().mockReturnValue(deferred.promise);
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin,
			onCreated: vi.fn(),
		});

		modal.onOpen();
		getTextForSetting("Name")?.setValue("Aldmere");
		getMockButtonComponents()[0]?.click();
		getMockButtonComponents()[0]?.click();

		expect(createPin).toHaveBeenCalledTimes(1);
		expect(getMockButtonComponents()[0]?.disabled).toBe(true);

		deferred.resolve(createPinResult());
		await flushPromises();
	});

	it("keeps modal open when createPin rejects", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const createPin = vi.fn().mockRejectedValue(new Error("Disk full."));
		const modal = new CreatePinModal({} as never, {
			map: createResolvedMap(),
			point: { x: 0.25, y: 0.75 },
			createPin,
			onCreated: vi.fn(),
		});

		modal.onOpen();
		getTextForSetting("Name")?.setValue("Aldmere");
		getMockButtonComponents()[0]?.click();
		await flushPromises();

		expect(modal.closed).toBe(false);
		expect(readErrorText(modal)).toBe("Disk full.");
		expect(getMockNotices()).toContain("Disk full.");
		expect(getMockButtonComponents()[0]?.disabled).toBe(false);
	});
});

function createDeferred<T>(): {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});

	return {
		promise,
		resolve,
		reject,
	};
}

function createResolvedMap(): ResolvedMap {
	return {
		folder: {} as never,
		folderPath: "World",
		name: "World",
		metadataFile: { path: "World/World.md" } as never,
		imageFile: { path: "World/World.png" } as never,
	};
}

function createPinResult(): CreatePinResult {
	return {
		pin: {
			id: "world-location-aldmere",
			name: "Aldmere",
			link: "[[Aldmere]]",
			entityPath: "World/Aldmere.md",
			type: "location",
			x: 0.25,
			y: 0.75,
		},
		entityFile: { path: "World/Aldmere.md" } as never,
		createdEntity: true,
	};
}

function createTemplateOptions(): TemplateOption[] {
	return [
		{ path: "Templates/Event.md", name: "Event" },
		{ path: "Templates/Location.md", name: "Location" },
	];
}

function getTextForSetting(name: string): MockTextComponent | undefined {
	const settings = getMockSettings();
	let settingIndex = -1;

	for (let index = settings.length - 1; index >= 0; index -= 1) {
		if (settings[index]?.name === name) {
			settingIndex = index;
			break;
		}
	}

	if (settingIndex === -1) {
		return undefined;
	}

	const textIndex = settings
		.slice(0, settingIndex + 1)
		.filter((setting) => isTextSettingName(setting.name)).length - 1;

	return getMockTextComponents()[textIndex];
}

function getDropdownForSetting(name: string): MockDropdownComponent | undefined {
	const settings = getMockSettings();
	let settingIndex = -1;

	for (let index = settings.length - 1; index >= 0; index -= 1) {
		if (settings[index]?.name === name) {
			settingIndex = index;
			break;
		}
	}

	if (settingIndex === -1) {
		return undefined;
	}

	const dropdownIndex = settings
		.slice(0, settingIndex + 1)
		.filter((setting) => isDropdownSettingName(setting.name)).length - 1;

	return getMockDropdownComponents()[dropdownIndex];
}

function isDropdownSettingName(name: string): boolean {
	return name === "Type" || name === "Subtype" || name === "Template";
}

function isTextSettingName(name: string): boolean {
	return name === "Name" || name === "Parent location" || name === "Region" || name === "Nation";
}

function readErrorText(modal: CreatePinModal): string {
	return ((modal as unknown as { errorEl: { text: string } | null }).errorEl?.text) ?? "";
}
