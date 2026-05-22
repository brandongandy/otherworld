import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatePinRequest, CreatePinResult } from "../src/services/PinCreationService";
import type { ResolvedMap } from "../src/types";
import { MapView } from "../src/views/MapView";

const { openedModals } = vi.hoisted(() => ({
	openedModals: [] as Array<{
		app: unknown;
		options: Record<string, unknown>;
	}>,
}));

vi.mock("../src/ui/CreatePinModal", () => ({
	CreatePinModal: class FakeCreatePinModal {
		constructor(
			readonly app: unknown,
			readonly options: Record<string, unknown>,
		) {
			openedModals.push(this);
		}

		open(): void {
			return undefined;
		}
	},
}));

describe("MapView double-click pin creation", () => {
	beforeEach(() => {
		openedModals.length = 0;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("opens the create pin modal with normalized coordinates when double-clicking inside the map image", () => {
		const view = createMapView();
		const stage = createStage();
		setReadyMapState(view);

		callPrivate(view, "bindStageEvents", stage);
		stage.dispatch("dblclick", createMouseEvent({
			clientX: 60,
			clientY: 70,
			target: createTarget(false),
		}));

		expect(openedModals).toHaveLength(1);
		expect(openedModals[0]?.options).toMatchObject({
			map: createResolvedMap(),
			point: {
				x: 0.25,
				y: 0.5,
			},
		});
	});

	it("opens the create pin modal with normalized coordinates when double-clicking inside a transformed map image", () => {
		const view = createMapView();
		const stage = createStage({
			left: 40,
			top: 30,
		});
		setReadyMapState(view, {
			imageSize: {
				width: 1000,
				height: 500,
			},
			transform: {
				scale: 2,
				x: -300,
				y: 125,
			},
		});

		callPrivate(view, "bindStageEvents", stage);
		stage.dispatch("dblclick", createMouseEvent({
			clientX: 480,
			clientY: 575,
			target: createTarget(false),
		}));

		expect(openedModals).toHaveLength(1);
		expect(openedModals[0]?.options).toMatchObject({
			map: createResolvedMap(),
			point: {
				x: 0.37,
				y: 0.42,
			},
		});
	});

	it("does not open the create pin modal when double-clicking outside the transformed image", () => {
		const view = createMapView();
		const stage = createStage({
			left: 40,
			top: 30,
		});
		setReadyMapState(view, {
			imageSize: {
				width: 1000,
				height: 500,
			},
			transform: {
				scale: 2,
				x: -300,
				y: 125,
			},
		});

		callPrivate(view, "bindStageEvents", stage);
		stage.dispatch("dblclick", createMouseEvent({
			clientX: 1760,
			clientY: 575,
			target: createTarget(false),
		}));

		expect(openedModals).toHaveLength(0);
	});

	it("does not open the create pin modal when double-clicking an existing pin", () => {
		const view = createMapView();
		const stage = createStage();
		setReadyMapState(view);

		callPrivate(view, "bindStageEvents", stage);
		stage.dispatch("dblclick", createMouseEvent({
			clientX: 60,
			clientY: 70,
			target: createTarget(true),
		}));

		expect(openedModals).toHaveLength(0);
	});

	it("passes discovered template options to the create pin modal", () => {
		const view = createMapView({
			templatesFolder: "Templates",
			templateFiles: [
				{ name: "Location.md", path: "Templates/Location.md" },
				{ name: "Event.md", path: "Templates/Event.md" },
				{ name: "Readme.txt", path: "Templates/Readme.txt" },
			],
		});
		const stage = createStage();
		setReadyMapState(view);

		callPrivate(view, "bindStageEvents", stage);
		stage.dispatch("dblclick", createMouseEvent({
			clientX: 60,
			clientY: 70,
			target: createTarget(false),
		}));

		expect(openedModals[0]?.options.templates).toEqual([
			{ path: "Templates/Event.md", name: "Event" },
			{ path: "Templates/Location.md", name: "Location" },
		]);
	});

	it("passes settings-derived defaults into create pin workflows", () => {
		const view = createMapView({
			settings: {
				entityFolders: {
					location: "Places",
					event: "Events",
					person: "People",
					faction: "Factions",
					item: "Items",
				},
				defaultSubtypes: {
					location: "town",
					event: "battle",
					person: "scholar",
					faction: "guild",
					item: "artifact",
				},
				parentLocationCreation: "always",
			},
		});
		const stage = createStage();
		setReadyMapState(view);

		callPrivate(view, "bindStageEvents", stage);
		stage.dispatch("dblclick", createMouseEvent({
			clientX: 60,
			clientY: 70,
			target: createTarget(false),
		}));

		expect(openedModals[0]?.options.defaultSubtypes).toEqual({
			location: "town",
			event: "battle",
			person: "scholar",
			faction: "guild",
			item: "artifact",
		});
	});

	it("passes settings-derived create options into PinCreationService", async () => {
		const view = createMapView({
			settings: {
				entityFolders: {
					location: "Places",
					event: "Events",
					person: "People",
					faction: "Factions",
					item: "Items",
				},
				defaultSubtypes: {
					location: "town",
					event: "battle",
					person: "scholar",
					faction: "guild",
					item: "artifact",
				},
				parentLocationCreation: "always",
				showPinLabelsByDefault: true,
			},
		});
		const createPin = vi.fn().mockResolvedValue(createPinResult());
		(view as unknown as { pinCreationService: { createPin: typeof createPin } }).pinCreationService = {
			createPin,
		};
		const stage = createStage();
		setReadyMapState(view);

		callPrivate(view, "bindStageEvents", stage);
		stage.dispatch("dblclick", createMouseEvent({
			clientX: 60,
			clientY: 70,
			target: createTarget(false),
		}));

		const modalCreatePin = openedModals[0]?.options.createPin as (request: CreatePinRequest) => Promise<CreatePinResult>;
		await modalCreatePin({
			map: createResolvedMap(),
			name: "Battle of Red Ford",
			type: "event",
			point: {
				x: 0.25,
				y: 0.5,
			},
		});

		expect(createPin).toHaveBeenCalledWith({
			map: createResolvedMap(),
			name: "Battle of Red Ford",
			type: "event",
			point: {
				x: 0.25,
				y: 0.5,
			},
			entityFolderPath: "Events",
			locationFolderPath: "Places",
			parentLocationCreation: "always",
		});
	});

	it("falls back to the location folder when modal request type is unexpected", async () => {
		const view = createMapView({
			settings: {
				entityFolders: {
					location: "Places",
					event: "Events",
					person: "People",
					faction: "Factions",
					item: "Items",
				},
				defaultSubtypes: {
					location: "town",
					event: "battle",
					person: "scholar",
					faction: "guild",
					item: "artifact",
				},
				parentLocationCreation: "always",
				showPinLabelsByDefault: true,
			},
		});
		const createPin = vi.fn().mockResolvedValue(createPinResult());
		(view as unknown as { pinCreationService: { createPin: typeof createPin } }).pinCreationService = {
			createPin,
		};
		const stage = createStage();
		setReadyMapState(view);

		callPrivate(view, "bindStageEvents", stage);
		stage.dispatch("dblclick", createMouseEvent({
			clientX: 60,
			clientY: 70,
			target: createTarget(false),
		}));

		const modalCreatePin = openedModals[0]?.options.createPin as (request: CreatePinRequest) => Promise<CreatePinResult>;
		await modalCreatePin({
			map: createResolvedMap(),
			name: "Aldmere",
			type: "planet",
			point: {
				x: 0.25,
				y: 0.5,
			},
		});

		expect(createPin).toHaveBeenCalledWith(expect.objectContaining({
			type: "planet",
			entityFolderPath: "Places",
			locationFolderPath: "Places",
			parentLocationCreation: "always",
		}));
	});

	it("configures parent location confirmation through global confirm", async () => {
		const view = createMapView();
		const originalConfirm = globalThis.confirm;
		const confirm = vi.fn(() => false);
		Object.defineProperty(globalThis, "confirm", {
			configurable: true,
			writable: true,
			value: confirm,
		});

		try {
			const confirmParentLocationCreation = (view as unknown as {
				pinCreationService: {
					dependencies: {
						confirmParentLocationCreation(input: { name: string; path: string }): Promise<boolean>;
					};
				};
			}).pinCreationService.dependencies.confirmParentLocationCreation;

			const result = await confirmParentLocationCreation({
				name: "Northern Marches",
				path: "Places/Northern Marches.md",
			});

			expect(result).toBe(false);
			expect(confirm).toHaveBeenCalledWith("Create parent location note \"Northern Marches\" at Places/Northern Marches.md?");
		} finally {
			if (originalConfirm) {
				Object.defineProperty(globalThis, "confirm", {
					configurable: true,
					writable: true,
					value: originalConfirm,
				});
			} else {
				Reflect.deleteProperty(globalThis, "confirm");
			}
		}
	});

	it("reads the selected template when the create pin modal callback creates a pin", async () => {
		const view = createMapView({
			templatesFolder: "Templates",
			templateFiles: [
				{
					name: "Location.md",
					path: "Templates/Location.md",
					content: [
						"# {{name}}",
						"",
						"Map: {{map}}",
					].join("\n"),
				},
			],
		});
		const app = readFakeApp(view);
		const stage = createStage();
		setReadyMapState(view);

		callPrivate(view, "bindStageEvents", stage);
		stage.dispatch("dblclick", createMouseEvent({
			clientX: 60,
			clientY: 70,
			target: createTarget(false),
		}));

		const createPin = openedModals[0]?.options.createPin as (request: CreatePinRequest) => Promise<CreatePinResult>;
		await createPin({
			map: createResolvedMap(),
			name: "Aldmere",
			type: "location",
			templatePath: "Templates/Location.md",
			point: {
				x: 0.25,
				y: 0.5,
			},
		});

		expect(app.vault.read).toHaveBeenCalledWith(expect.objectContaining({
			path: "Templates/Location.md",
		}));
		expect(app.createdContent.get("World/Aldmere.md")).toContain([
			"# Aldmere",
			"",
			"Map: World",
		].join("\n"));
	});

	it("preserves the current transform when the create pin callback refreshes the map", async () => {
		const view = createMapView();
		const stage = createStage();
		setReadyMapState(view, {
			imageSize: {
				width: 1000,
				height: 500,
			},
			transform: {
				scale: 2,
				x: -300,
				y: 125,
			},
		});
		const render = vi.fn();
		(view as unknown as { render: typeof render }).render = render;

		callPrivate(view, "bindStageEvents", stage);
		stage.dispatch("dblclick", createMouseEvent({
			clientX: 210,
			clientY: 645,
			target: createTarget(false),
		}));

		const onCreated = openedModals[0]?.options.onCreated as (result: CreatePinResult) => Promise<void>;
		await onCreated({
			pin: {
				id: "world__location__aldmere",
				name: "Aldmere",
				link: "[[Aldmere]]",
				entityPath: "World/Aldmere.md",
				type: "location",
				x: 0.25,
				y: 0.5,
			},
			entityFile: { path: "World/Aldmere.md" } as never,
			createdEntity: true,
		});

		expect(render).toHaveBeenCalledWith({ preserveTransform: true });
	});

	it("opens the create pin modal without templates when template discovery fails", () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const view = createMapView({
			templatesFolder: "Templates",
			templateFiles: [],
		});
		const stage = createStage();
		setReadyMapState(view);
		((view as unknown as { templateService: { listTemplateOptions(): never } }).templateService) = {
			listTemplateOptions: () => {
				throw new Error("Template plugin changed shape.");
			},
		};

		callPrivate(view, "bindStageEvents", stage);
		stage.dispatch("dblclick", createMouseEvent({
			clientX: 60,
			clientY: 70,
			target: createTarget(false),
		}));

		expect(openedModals).toHaveLength(1);
		expect(openedModals[0]?.options.templates).toEqual([]);
		expect(consoleError).toHaveBeenCalledWith("Unable to load template options", expect.any(Error));
	});
});

function createMapView(options: {
	templatesFolder?: string;
	templateFiles?: Array<{ name: string; path: string; content?: string }>;
	settings?: Record<string, unknown>;
} = {}): MapView {
	const worldFolder = {
		name: "World",
		path: "World",
		children: [] as unknown[],
	};
	const metadataFile = createFileLike("World.md", "World/World.md");
	const imageFile = createFileLike("World.png", "World/World.png");
	worldFolder.children.push(metadataFile, imageFile);
	const filesByPath = new Map<string, unknown>([
		["World", worldFolder],
		[metadataFile.path, metadataFile],
		[imageFile.path, imageFile],
	]);
	const contentByPath = new Map<string, string>();
	const createdContent = new Map<string, string>();
	const templateFolder = options.templatesFolder
		? {
			name: options.templatesFolder,
			path: options.templatesFolder,
			children: (options.templateFiles ?? []).map((template) => {
				const file = createFileLike(template.name, template.path);
				filesByPath.set(template.path, file);
				contentByPath.set(template.path, template.content ?? "");
				return file;
			}),
		}
		: null;
	if (options.templatesFolder) {
		filesByPath.set(options.templatesFolder, templateFolder);
	}
	const app = {
		createdContent,
		fileManager: {
			processFrontMatter: vi.fn(async (_file, callback: (frontmatter: Record<string, unknown>) => void) => {
				callback({
					worldbuildingMap: {
						image: "World.png",
						coordinateSystem: "normalizedImage",
						pins: [],
					},
				});
			}),
		},
		internalPlugins: options.templatesFolder
			? {
				plugins: {
					templates: {
						enabled: true,
						instance: {
							options: {
								folder: options.templatesFolder,
							},
						},
					},
				},
			}
			: undefined,
		metadataCache: {
			getFileCache: vi.fn(() => ({
				frontmatter: {
					worldbuildingMap: {
						pins: [],
					},
				},
			})),
		},
		vault: {
			getAbstractFileByPath: vi.fn((path: string) => {
				return filesByPath.get(path) ?? null;
			}),
			getResourcePath: vi.fn(),
			read: vi.fn(async (file: { path: string }) => contentByPath.get(file.path) ?? ""),
			create: vi.fn(async (path: string, content: string) => {
				const name = path.split("/").pop() ?? path;
				const file = createFileLike(name, path);
				filesByPath.set(path, file);
				createdContent.set(path, content);
				return file;
			}),
		},
	};
	const leaf = { app };
	const plugin = {
		app,
		settings: options.settings ?? {
			entityFolders: {
				location: "World",
				event: "World",
				person: "World",
				faction: "World",
				item: "World",
			},
			defaultSubtypes: {
				location: "",
				event: "",
				person: "",
				faction: "",
				item: "",
			},
			parentLocationCreation: "ask",
			showPinLabelsByDefault: true,
		},
	};

	return new MapView(leaf as never, plugin as never);
}

function createFileLike(name: string, path: string): {
	name: string;
	basename: string;
	extension: string;
	path: string;
} {
	const extensionStart = name.lastIndexOf(".");
	return {
		name,
		basename: extensionStart === -1 ? name : name.slice(0, extensionStart),
		extension: extensionStart === -1 ? "" : name.slice(extensionStart + 1),
		path,
	};
}

function readFakeApp(view: MapView): {
	createdContent: Map<string, string>;
	vault: {
		read: ReturnType<typeof vi.fn>;
	};
} {
	return (view as unknown as {
		app: {
			createdContent: Map<string, string>;
			vault: {
				read: ReturnType<typeof vi.fn>;
			};
		};
	}).app;
}

function setReadyMapState(
	view: MapView,
	options: {
		imageSize?: { width: number; height: number };
		transform?: { scale: number; x: number; y: number };
	} = {},
): void {
	const mutableView = view as unknown as {
		imageSize: { width: number; height: number };
		resolvedMap: ResolvedMap;
		transform: { scale: number; x: number; y: number };
	};
	mutableView.imageSize = options.imageSize ?? {
		width: 200,
		height: 100,
	};
	mutableView.resolvedMap = createResolvedMap();
	mutableView.transform = options.transform ?? {
		scale: 1,
		x: 0,
		y: 0,
	};
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

function createPinResult(): CreatePinResult {
	return {
		pin: {
			id: "world__location__aldmere",
			name: "Aldmere",
			link: "[[Aldmere]]",
			entityPath: "World/Aldmere.md",
			type: "location",
			x: 0.25,
			y: 0.5,
		},
		entityFile: { path: "World/Aldmere.md" } as never,
		createdEntity: true,
	};
}

function createStage(rect: Pick<DOMRect, "left" | "top"> = {
	left: 10,
	top: 20,
}): {
	addEventListener(type: string, listener: (event: never) => void): void;
	dispatch(type: string, event: MouseEvent): void;
	getBoundingClientRect(): Pick<DOMRect, "left" | "top">;
	addClass(): void;
	removeClass(): void;
	setPointerCapture(): void;
	hasPointerCapture(): boolean;
	releasePointerCapture(): void;
} {
	const listeners = new Map<string, Array<(event: never) => void>>();

	return {
		addEventListener(type, listener): void {
			listeners.set(type, [...(listeners.get(type) ?? []), listener]);
		},
		dispatch(type, event): void {
			for (const listener of listeners.get(type) ?? []) {
				listener.call(this, event as never);
			}
		},
		getBoundingClientRect(): Pick<DOMRect, "left" | "top"> {
			return rect;
		},
		addClass(): void {
			return undefined;
		},
		removeClass(): void {
			return undefined;
		},
		setPointerCapture(): void {
			return undefined;
		},
		hasPointerCapture(): boolean {
			return false;
		},
		releasePointerCapture(): void {
			return undefined;
		},
	};
}

function createMouseEvent(input: {
	clientX: number;
	clientY: number;
	target: Pick<HTMLElement, "closest">;
}): MouseEvent {
	return input as MouseEvent;
}

function createTarget(isPin: boolean): Pick<HTMLElement, "closest"> {
	return {
		closest(selector: string): HTMLElement | null {
			return isPin && selector === ".otherworld-map-view__pin" ? {} as HTMLElement : null;
		},
	};
}

function callPrivate<TArgs extends unknown[]>(
	target: unknown,
	methodName: string,
	...args: TArgs
): unknown {
	const method = (target as Record<string, (...methodArgs: TArgs) => unknown>)[methodName];
	return method.apply(target, args);
}
