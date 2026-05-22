import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditPinResult } from "../src/services/PinEditService";
import type { MapPin, ResolvedMap } from "../src/types";
import { MapView } from "../src/views/MapView";
import { getMockMenus, getMockNotices, resetObsidianMocks } from "./mocks/obsidian";

const { openedEditModals } = vi.hoisted(() => ({
	openedEditModals: [] as Array<{
		app: unknown;
		options: Record<string, unknown>;
	}>,
}));

vi.mock("../src/ui/EditPinModal", () => ({
	EditPinModal: class FakeEditPinModal {
		constructor(
			readonly app: unknown,
			readonly options: Record<string, unknown>,
		) {
			openedEditModals.push(this);
		}

		open(): void {
			return undefined;
		}
	},
}));

describe("MapView pin editing", () => {
	beforeEach(() => {
		resetObsidianMocks();
		openedEditModals.length = 0;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("opens the linked note on normal click", () => {
		const view = createMapView();
		const layer = createFakeLayer();
		const pin = createPin();
		const app = readFakeApp(view);

		callPrivate(view, "renderPin", layer, pin);
		layer.createdButtons[0]?.dispatch("click", createMouseEvent());

		expect(openedEditModals).toHaveLength(0);
		expect(app.workspace.openedFile).toMatchObject({ path: "World/Aldmere.md" });
	});

	it("opens edit mode on Command-click", () => {
		const view = createMapView();
		const layer = createFakeLayer();
		const pin = createPin();

		callPrivate(view, "renderPin", layer, pin);
		layer.createdButtons[0]?.dispatch("click", createMouseEvent({ metaKey: true }));

		expect(openedEditModals).toHaveLength(1);
		expect(openedEditModals[0]?.options).toMatchObject({
			map: createResolvedMap(),
			pin,
		});
	});

	it("opens edit mode on Control-click", () => {
		const view = createMapView();
		const layer = createFakeLayer();
		const pin = createPin();

		callPrivate(view, "renderPin", layer, pin);
		layer.createdButtons[0]?.dispatch("click", createMouseEvent({ ctrlKey: true }));

		expect(openedEditModals).toHaveLength(1);
		expect(openedEditModals[0]?.options).toMatchObject({
			map: createResolvedMap(),
			pin,
		});
	});

	it("preserves the current transform when the edit modal save callback refreshes the map", async () => {
		const view = createMapView();
		const layer = createFakeLayer();
		const render = vi.fn();
		(view as unknown as { render: typeof render }).render = render;

		callPrivate(view, "renderPin", layer, createPin());
		layer.createdButtons[0]?.dispatch("click", createMouseEvent({ ctrlKey: true }));
		const onSaved = openedEditModals[0]?.options.onSaved as (result: EditPinResult) => Promise<void>;
		await onSaved({
			pin: createPin(),
			entityMetadataUpdated: true,
		});

		expect(render).toHaveBeenCalledWith({ preserveTransform: true });
	});

	it("shows warning notices returned by PinEditService", async () => {
		const view = createMapView();
		const layer = createFakeLayer();

		callPrivate(view, "renderPin", layer, createPin());
		layer.createdButtons[0]?.dispatch("click", createMouseEvent({ ctrlKey: true }));
		const onSaved = openedEditModals[0]?.options.onSaved as (result: EditPinResult) => Promise<void>;
		await onSaved({
			pin: createPin(),
			entityMetadataUpdated: false,
			warning: "Updated pin, but linked note was not found.",
		});

		expect(getMockNotices()).toContain("Updated pin, but linked note was not found.");
	});

	it("creates a context menu with edit, open, reveal, and copy actions", () => {
		const view = createMapView();
		const layer = createFakeLayer();

		callPrivate(view, "renderPin", layer, createPin());
		layer.createdButtons[0]?.dispatch("contextmenu", createMouseEvent());

		expect(getMockMenus()).toHaveLength(1);
		expect(getMockMenus()[0]?.items.map((item) => item.title)).toEqual([
			"Edit pin",
			"Open note",
			"Reveal note",
			"Copy wikilink",
		]);
	});

	it("context menu edit action opens edit mode", () => {
		const view = createMapView();
		const layer = createFakeLayer();

		callPrivate(view, "renderPin", layer, createPin());
		layer.createdButtons[0]?.dispatch("contextmenu", createMouseEvent());
		getMockMenus()[0]?.items[0]?.click();

		expect(openedEditModals).toHaveLength(1);
	});

	it("context menu reveal action opens the note and runs the file explorer reveal command", async () => {
		const view = createMapView();
		const app = readFakeApp(view);
		const layer = createFakeLayer();

		callPrivate(view, "renderPin", layer, createPin());
		layer.createdButtons[0]?.dispatch("contextmenu", createMouseEvent());
		getMockMenus()[0]?.items[2]?.click();
		await flushPromises();

		expect(app.workspace.openedFile).toMatchObject({ path: "World/Aldmere.md" });
		expect(app.commands.executeCommandById).toHaveBeenCalledWith("file-explorer:reveal-active-file");
	});

	it("context menu reveal action reports when the file explorer reveal command is unavailable", async () => {
		const view = createMapView();
		const app = readFakeApp(view);
		const layer = createFakeLayer();
		app.commands.executeCommandById.mockReturnValue(false);

		callPrivate(view, "renderPin", layer, createPin());
		layer.createdButtons[0]?.dispatch("contextmenu", createMouseEvent());
		getMockMenus()[0]?.items[2]?.click();
		await flushPromises();

		expect(app.workspace.openedFile).toMatchObject({ path: "World/Aldmere.md" });
		expect(getMockNotices()).toContain("Opened note, but file explorer reveal is not available.");
	});

	it("context menu copy action writes the pin wikilink to the clipboard", async () => {
		const writeText = vi.fn(async () => undefined);
		const view = createMapView();
		const layer = createFakeLayer();
		vi.stubGlobal("navigator", {
			clipboard: {
				writeText,
			},
		});

		callPrivate(view, "renderPin", layer, createPin());
		layer.createdButtons[0]?.dispatch("contextmenu", createMouseEvent());
		getMockMenus()[0]?.items[3]?.click();
		await flushPromises();

		expect(writeText).toHaveBeenCalledWith("[[Aldmere]]");
		expect(getMockNotices()).not.toContain("Unable to copy wikilink.");
	});

	it("context menu copy action reports when the clipboard is unavailable", async () => {
		const view = createMapView();
		const layer = createFakeLayer();
		vi.stubGlobal("navigator", {});

		callPrivate(view, "renderPin", layer, createPin());
		layer.createdButtons[0]?.dispatch("contextmenu", createMouseEvent());
		getMockMenus()[0]?.items[3]?.click();
		await flushPromises();

		expect(getMockNotices()).toContain("Clipboard is not available.");
	});

	it("context menu copy action reports when writing the wikilink fails", async () => {
		const writeText = vi.fn(async () => {
			throw new Error("Clipboard denied");
		});
		const view = createMapView();
		const layer = createFakeLayer();
		vi.stubGlobal("navigator", {
			clipboard: {
				writeText,
			},
		});

		callPrivate(view, "renderPin", layer, createPin());
		layer.createdButtons[0]?.dispatch("contextmenu", createMouseEvent());
		getMockMenus()[0]?.items[3]?.click();
		await flushPromises();

		expect(getMockNotices()).toContain("Unable to copy wikilink.");
	});

	it("context menu open action reports when the linked note target is missing", async () => {
		const view = createMapView();
		const layer = createFakeLayer();
		const pin = createPin({
			entityPath: "World/Missing.md",
			link: "[[Missing]]",
			name: "Missing",
		});

		callPrivate(view, "renderPin", layer, pin);
		layer.createdButtons[0]?.dispatch("contextmenu", createMouseEvent());
		getMockMenus()[0]?.items[1]?.click();
		await flushPromises();

		expect(getMockNotices()).toContain("Map pin target not found: World/Missing.md");
	});
});

function createMapView(): MapView {
	const files = new Map<string, unknown>([
		["World/Aldmere.md", { path: "World/Aldmere.md", basename: "Aldmere", extension: "md" }],
	]);
	const app = {
		fileManager: {
			processFrontMatter: vi.fn(),
		},
		metadataCache: {
			getFileCache: vi.fn(),
			getFirstLinkpathDest: vi.fn((linkpath: string) => files.get(`World/${linkpath}.md`) ?? null),
		},
		vault: {
			getAbstractFileByPath: vi.fn((path: string) => files.get(path) ?? null),
			getResourcePath: vi.fn(),
		},
		commands: {
			executeCommandById: vi.fn(),
		},
		workspace: {
			openedFile: null as unknown,
			getLeaf: vi.fn(() => ({
				openFile: vi.fn(async (file: unknown) => {
					app.workspace.openedFile = file;
				}),
			})),
		},
	};
	const leaf = { app };
	const plugin = { app };
	const view = new MapView(leaf as never, plugin as never);
	(view as unknown as {
		metadataFilePath: string;
		resolvedMap: ResolvedMap;
	}).metadataFilePath = "World/World.md";
	(view as unknown as {
		metadataFilePath: string;
		resolvedMap: ResolvedMap;
	}).resolvedMap = createResolvedMap();
	return view;
}

function createResolvedMap(): ResolvedMap {
	return {
		folder: {} as never,
		folderPath: "World",
		imageFile: { path: "World/World.png" } as never,
		metadataFile: { path: "World/World.md" } as never,
		name: "World",
	};
}

function createPin(overrides: Partial<MapPin> = {}): MapPin {
	return {
		id: "world__location__aldmere",
		name: "Aldmere",
		link: "[[Aldmere]]",
		entityPath: "World/Aldmere.md",
		type: "location",
		x: 0.25,
		y: 0.5,
		...overrides,
	};
}

function createFakeLayer(): {
	createdButtons: FakeButton[];
	createEl(tag: string, options: { cls: string; attr: Record<string, string> }): FakeButton;
} {
	const createdButtons: FakeButton[] = [];

	return {
		createdButtons,
		createEl(tag, options): FakeButton {
			const button = new FakeButton(tag, options);
			createdButtons.push(button);
			return button;
		},
	};
}

class FakeButton {
	readonly children: Array<{ cls: string; text?: string }> = [];
	readonly style: Record<string, string> = {};
	private readonly listeners = new Map<string, Array<(event: never) => void>>();

	constructor(
		readonly tag: string,
		readonly options: { cls: string; attr: Record<string, string> },
	) {
	}

	createSpan(options: { cls: string; text?: string }): void {
		this.children.push(options);
	}

	addEventListener(type: string, listener: (event: never) => void): void {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	dispatch(type: string, event: MouseEvent): void {
		for (const listener of this.listeners.get(type) ?? []) {
			listener(event as never);
		}
	}
}

function createMouseEvent(options: Partial<MouseEvent> = {}): MouseEvent {
	return {
		metaKey: false,
		ctrlKey: false,
		stopPropagation: vi.fn(),
		preventDefault: vi.fn(),
		...options,
	} as MouseEvent;
}

function readFakeApp(view: MapView): {
	commands: {
		executeCommandById: ReturnType<typeof vi.fn>;
	};
	workspace: {
		openedFile: unknown;
	};
} {
	return (view as unknown as {
		app: {
			commands: {
				executeCommandById: ReturnType<typeof vi.fn>;
			};
			workspace: {
				openedFile: unknown;
			};
		};
	}).app;
}

function flushPromises(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function callPrivate<TArgs extends unknown[]>(
	target: unknown,
	methodName: string,
	...args: TArgs
): unknown {
	const method = (target as Record<string, (...methodArgs: TArgs) => unknown>)[methodName];
	return method.apply(target, args);
}
