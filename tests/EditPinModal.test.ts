import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Setting } from "obsidian";
import type { EditPinResult } from "../src/services/PinEditService";
import type { MapPin, ResolvedMap } from "../src/types";
import { EditPinModal, validateEditPinForm } from "../src/ui/EditPinModal";
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

describe("validateEditPinForm", () => {
	it("accepts a location edit with normalized fields", () => {
		expect(validateEditPinForm({
			name: " Aldmere   Crossing ",
			type: "location",
			subtype: "town",
			x: "0.5",
			y: "0.25",
			parentLocation: " Western Road ",
			region: "Northern Marches",
			nation: "Valoria",
		})).toEqual({
			ok: true,
			value: {
				name: "Aldmere Crossing",
				type: "location",
				subtype: "town",
				x: 0.5,
				y: 0.25,
				parentLocation: "Western Road",
				region: "Northern Marches",
				nation: "Valoria",
			},
		});
	});

	it("rejects empty names, invalid types, invalid subtypes, and invalid coordinates", () => {
		expect(validateEditPinForm({
			name: " ",
			type: "location",
			x: "0.5",
			y: "0.25",
		})).toEqual({ ok: false, error: "Enter a pin name." });

		expect(validateEditPinForm({
			name: "Aldmere",
			type: "planet",
			x: "0.5",
			y: "0.25",
		})).toEqual({ ok: false, error: "Choose a supported pin type." });

		expect(validateEditPinForm({
			name: "Aldmere",
			type: "event",
			subtype: "city",
			x: "0.5",
			y: "0.25",
		})).toEqual({ ok: false, error: "Pin subtype is not supported for the selected type." });

		expect(validateEditPinForm({
			name: "Aldmere",
			type: "location",
			x: "2",
			y: "0.25",
		})).toEqual({
			ok: false,
			error: "Pin coordinates must be normalized values from 0 to 1.",
		});
	});

	it("rejects hierarchy fields for non-location pins", () => {
		expect(validateEditPinForm({
			name: "Battle",
			type: "event",
			subtype: "battle",
			x: "0.5",
			y: "0.25",
			parentLocation: "Northern Marches",
		})).toEqual({
			ok: false,
			error: "Location hierarchy fields are only supported for location pins.",
		});
	});
});

describe("EditPinModal", () => {
	it("initializes form fields from the current pin and shows linked note as read-only context", () => {
		const setDescSpy = vi.spyOn(Setting.prototype, "setDesc");
		const addTextSpy = vi.spyOn(Setting.prototype, "addText");
		const modal = new EditPinModal({} as never, {
			map: createResolvedMap(),
			pin: createLocationPin(),
			savePin: vi.fn(),
			onSaved: vi.fn(),
		});

		modal.onOpen();

		expect(getMockSettings().map((setting) => setting.name)).toEqual([
			"Name",
			"Linked note",
			"Type",
			"Subtype",
			"X",
			"Y",
			"Parent location",
			"Region",
			"Nation",
			"",
		]);
		expect(getTextForSetting("Name")?.value).toBe("Aldmere");
		expect(getDropdownForSetting("Type")?.value).toBe("location");
		expect(getDropdownForSetting("Subtype")?.value).toBe("city");
		expect(getTextForSetting("X")?.value).toBe("0.421");
		expect(getTextForSetting("Y")?.value).toBe("0.337");
		expect(getTextForSetting("Parent location")?.value).toBe("[[Northern Marches]]");
		expect(getTextForSetting("Region")?.value).toBe("Northern Marches");
		expect(getTextForSetting("Nation")?.value).toBe("Valoria");
		expect(setDescSpy).toHaveBeenCalledWith("World/Aldmere.md");
		expect((addTextSpy.mock.contexts as Array<{ name?: string }>)
			.map((setting) => setting.name))
			.not.toContain("Linked note");
	});

	it("hides and clears hierarchy fields when type changes away from location", async () => {
		const savePin = vi.fn().mockResolvedValue(editPinResult());
		const modal = new EditPinModal({} as never, {
			map: createResolvedMap(),
			pin: createLocationPin(),
			savePin,
			onSaved: vi.fn(),
		});

		modal.onOpen();
		getDropdownForSetting("Type")?.setSelectedValue("event");
		getDropdownForSetting("Subtype")?.setSelectedValue("battle");
		getMockButtonComponents().at(-1)?.click();
		await flushPromises();

		expect(getMockSettings().slice(-5).map((setting) => setting.name)).not.toContain("Parent location");
		expect(savePin).toHaveBeenCalledWith({
			map: createResolvedMap(),
			pin: createLocationPin(),
			name: "Aldmere",
			type: "event",
			subtype: "battle",
			x: 0.421,
			y: 0.337,
		});
	});

	it("submits edited location metadata", async () => {
		const savePin = vi.fn().mockResolvedValue(editPinResult());
		const modal = new EditPinModal({} as never, {
			map: createResolvedMap(),
			pin: createLocationPin(),
			savePin,
			onSaved: vi.fn(),
		});

		modal.onOpen();
		getTextForSetting("Name")?.setValue("Aldmere Crossing");
		getDropdownForSetting("Subtype")?.setSelectedValue("town");
		getTextForSetting("X")?.setValue("0.5");
		getTextForSetting("Y")?.setValue("0.25");
		getTextForSetting("Parent location")?.setValue("Western Road");
		getTextForSetting("Region")?.setValue("Northern Marches");
		getTextForSetting("Nation")?.setValue("Valoria");
		getMockButtonComponents().at(-1)?.click();
		await flushPromises();

		expect(savePin).toHaveBeenCalledWith({
			map: createResolvedMap(),
			pin: createLocationPin(),
			name: "Aldmere Crossing",
			type: "location",
			subtype: "town",
			x: 0.5,
			y: 0.25,
			parentLocation: "Western Road",
			region: "Northern Marches",
			nation: "Valoria",
		});
	});

	it("closes after save succeeds and passes the result to onSaved", async () => {
		const result = editPinResult();
		const savePin = vi.fn().mockResolvedValue(result);
		const onSaved = vi.fn();
		const modal = new EditPinModal({} as never, {
			map: createResolvedMap(),
			pin: createLocationPin(),
			savePin,
			onSaved,
		});

		modal.onOpen();
		getMockButtonComponents().at(-1)?.click();
		await flushPromises();

		expect(modal.closed).toBe(true);
		expect(onSaved).toHaveBeenCalledWith(result);
	});

	it("closes after savePin succeeds even if onSaved fails", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const result = editPinResult();
		const savePin = vi.fn().mockResolvedValue(result);
		const onSaved = vi.fn().mockRejectedValue(new Error("Refresh failed."));
		const modal = new EditPinModal({} as never, {
			map: createResolvedMap(),
			pin: createLocationPin(),
			savePin,
			onSaved,
		});

		modal.onOpen();
		getMockButtonComponents().at(-1)?.click();
		await flushPromises();

		expect(savePin).toHaveBeenCalledTimes(1);
		expect(onSaved).toHaveBeenCalledWith(result);
		expect(modal.closed).toBe(true);
		expect(readErrorText(modal)).toBe("");
		expect(getMockNotices()).toContain("Saved pin, but the map could not refresh.");
		expect(consoleError).toHaveBeenCalledWith("Unable to refresh map after editing pin", expect.any(Error));
		expect(consoleError).not.toHaveBeenCalledWith("Unable to edit map pin", expect.any(Error));
	});

	it("ignores duplicate save clicks while save is pending", async () => {
		const deferred = createDeferred<EditPinResult>();
		const savePin = vi.fn().mockReturnValue(deferred.promise);
		const modal = new EditPinModal({} as never, {
			map: createResolvedMap(),
			pin: createLocationPin(),
			savePin,
			onSaved: vi.fn(),
		});

		modal.onOpen();
		getMockButtonComponents().at(-1)?.click();
		getMockButtonComponents().at(-1)?.click();

		expect(savePin).toHaveBeenCalledTimes(1);
		expect(getMockButtonComponents().at(-1)?.disabled).toBe(true);

		deferred.resolve(editPinResult());
		await flushPromises();
	});

	it("keeps the modal open when save rejects", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const savePin = vi.fn().mockRejectedValue(new Error("Map pin could not be found."));
		const modal = new EditPinModal({} as never, {
			map: createResolvedMap(),
			pin: createLocationPin(),
			savePin,
			onSaved: vi.fn(),
		});

		modal.onOpen();
		getMockButtonComponents().at(-1)?.click();
		await flushPromises();

		expect(modal.closed).toBe(false);
		expect(readErrorText(modal)).toBe("Map pin could not be found.");
		expect(getMockNotices()).toContain("Map pin could not be found.");
		expect(getMockButtonComponents().at(-1)?.disabled).toBe(false);
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

function createLocationPin(): MapPin {
	return {
		id: "world__location__aldmere",
		name: "Aldmere",
		link: "[[Aldmere]]",
		entityPath: "World/Aldmere.md",
		type: "location",
		subtype: "city",
		parentLocation: "[[Northern Marches]]",
		region: "Northern Marches",
		nation: "Valoria",
		x: 0.421,
		y: 0.337,
	};
}

function editPinResult(): EditPinResult {
	return {
		pin: createLocationPin(),
		entityMetadataUpdated: true,
	};
}

function getTextForSetting(name: string): MockTextComponent | undefined {
	const settings = getMockSettings();
	const settingIndex = findLastSettingIndex(name);

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
	const settingIndex = findLastSettingIndex(name);

	if (settingIndex === -1) {
		return undefined;
	}

	const dropdownIndex = settings
		.slice(0, settingIndex + 1)
		.filter((setting) => setting.name === "Type" || setting.name === "Subtype").length - 1;

	return getMockDropdownComponents()[dropdownIndex];
}

function findLastSettingIndex(name: string): number {
	const settings = getMockSettings();

	for (let index = settings.length - 1; index >= 0; index -= 1) {
		if (settings[index]?.name === name) {
			return index;
		}
	}

	return -1;
}

function isTextSettingName(name: string): boolean {
	return name === "Name"
		|| name === "X"
		|| name === "Y"
		|| name === "Parent location"
		|| name === "Region"
		|| name === "Nation";
}

function readErrorText(modal: EditPinModal): string {
	return ((modal as unknown as { errorEl: { text: string } | null }).errorEl?.text) ?? "";
}
