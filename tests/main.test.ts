import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type OtherworldSettings } from "../src/settings";
import { getMockNotices, resetObsidianMocks } from "./mocks/obsidian";

const OTHERWORLD_MAP_VIEW_TYPE = "otherworld-map-view";
const NO_MAP_NOTICE = "No worldbuilding map found for the current context.";
const INDEX_ERROR_NOTICE = "Unable to generate map entity index.";

interface ResolvedMap {
	folderPath: string;
}

interface FakeFolder {
	name: string;
	path: string;
	children: unknown[];
}

interface FakeFile {
	name: string;
	basename: string;
	extension: string;
	path: string;
	parent: FakeFolder | null;
}

interface PluginCommand {
	id: string;
	name: string;
	callback: () => void;
}

interface PluginUnderTest {
	app: {
		vault: {
			create: ReturnType<typeof vi.fn>;
			getAbstractFileByPath: ReturnType<typeof vi.fn>;
			modify: ReturnType<typeof vi.fn>;
			read: ReturnType<typeof vi.fn>;
		};
		metadataCache: {
			getFileCache: ReturnType<typeof vi.fn>;
			getFirstLinkpathDest: ReturnType<typeof vi.fn>;
		};
		workspace: {
			activeLeaf?: unknown;
			getActiveFile: ReturnType<typeof vi.fn>;
			getLeavesOfType: ReturnType<typeof vi.fn>;
			getLeaf: ReturnType<typeof vi.fn>;
			on: ReturnType<typeof vi.fn>;
			revealLeaf: ReturnType<typeof vi.fn>;
			setActiveLeaf: ReturnType<typeof vi.fn>;
		};
	};
	settings: OtherworldSettings;
	discoveryService: {
		resolveFromAbstractFile: ReturnType<typeof vi.fn>;
		resolveFromFile: ReturnType<typeof vi.fn>;
		resolveFromFolderPath: ReturnType<typeof vi.fn>;
	};
	addCommand: ReturnType<typeof vi.fn>;
	addSettingTab: ReturnType<typeof vi.fn>;
	loadData: ReturnType<typeof vi.fn>;
	onload(): Promise<void>;
	openResolvedMap(resolvedMap: ResolvedMap): Promise<void>;
	openMapForOpenedImage(file: FakeFile | null): Promise<void>;
	registerEvent: ReturnType<typeof vi.fn>;
	registerView: ReturnType<typeof vi.fn>;
	resolveMapForIndex(): ResolvedMap | null;
	saveData: ReturnType<typeof vi.fn>;
	generateMapEntityIndex(): Promise<void>;
}

type FileOpenHandler = (file: FakeFile | null) => void;

beforeEach(() => {
	resetObsidianMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

async function createPlugin(): Promise<PluginUnderTest> {
	const { default: OtherworldPlugin } = await import("../src/main");

	return Object.assign(Object.create(OtherworldPlugin.prototype), {
		app: {
			vault: {
				create: vi.fn(),
				getAbstractFileByPath: vi.fn(),
				modify: vi.fn(),
				read: vi.fn(),
			},
			metadataCache: {
				getFileCache: vi.fn(),
				getFirstLinkpathDest: vi.fn(),
			},
			workspace: {
				getActiveFile: vi.fn(() => null),
				getLeavesOfType: vi.fn(() => []),
				getLeaf: vi.fn(),
				on: vi.fn(() => ({})),
				revealLeaf: vi.fn(),
				setActiveLeaf: vi.fn(),
			},
		},
		settings: structuredClone(DEFAULT_SETTINGS),
		discoveryService: {
			resolveFromAbstractFile: vi.fn(),
			resolveFromFile: vi.fn(),
			resolveFromFolderPath: vi.fn(),
		},
		addCommand: vi.fn(),
		addSettingTab: vi.fn(),
		loadData: vi.fn(async () => undefined),
		registerEvent: vi.fn(),
		registerView: vi.fn(),
		saveData: vi.fn(),
	}) as PluginUnderTest;
}

function folder(name: string, path: string): FakeFolder {
	return { name, path, children: [] };
}

function file(name: string, path: string, parent: FakeFolder | null): FakeFile {
	const extensionStart = name.lastIndexOf(".");
	const extension = extensionStart === -1 ? "" : name.slice(extensionStart + 1);
	const basename = extensionStart === -1 ? name : name.slice(0, extensionStart);
	const created = { name, basename, extension, path, parent };
	parent?.children.push(created);
	return created;
}

describe("OtherworldPlugin map opening", () => {
	it("queues image-open map handling until after Obsidian finishes the file-open event", async () => {
		vi.useFakeTimers();

		try {
			const plugin = await createPlugin();
			const world = folder("World", "World");
			const image = file("World.png", "World/World.png", world);
			const openMapForOpenedImage = vi.fn(async () => undefined);
			plugin.openMapForOpenedImage = openMapForOpenedImage;

			await plugin.onload();
			const fileOpenHandler = getFileOpenHandler(plugin);
			fileOpenHandler(image);

			expect(openMapForOpenedImage).not.toHaveBeenCalled();

			await vi.runOnlyPendingTimersAsync();

			expect(openMapForOpenedImage).toHaveBeenCalledOnce();
			expect(openMapForOpenedImage).toHaveBeenCalledWith(image);
		} finally {
			vi.useRealTimers();
		}
	});

	it("registers the map entity index command during load", async () => {
		const plugin = await createPlugin();

		await plugin.onload();

		const command = plugin.addCommand.mock.calls
			.map(([registeredCommand]) => registeredCommand as PluginCommand)
			.find((registeredCommand) => registeredCommand.id === "generate-map-entity-index");
		expect(command).toMatchObject({
			id: "generate-map-entity-index",
			name: "Generate map entity index",
		});

		const generateMapEntityIndex = vi.fn(async () => undefined);
		plugin.generateMapEntityIndex = generateMapEntityIndex;
		command?.callback();

		expect(generateMapEntityIndex).toHaveBeenCalledOnce();
	});

	it("resolves a map entity index from the active file context", async () => {
		const plugin = await createPlugin();
		const world = folder("World", "World");
		const activeFile = file("Aldmere.md", "World/Locations/Aldmere.md", world);
		const resolvedMap = { folderPath: "World" };
		plugin.app.workspace.getActiveFile = vi.fn(() => activeFile);
		plugin.discoveryService.resolveFromAbstractFile = vi.fn(() => resolvedMap);

		const result = plugin.resolveMapForIndex();

		expect(result).toBe(resolvedMap);
		expect(plugin.discoveryService.resolveFromAbstractFile).toHaveBeenCalledWith(activeFile);
	});

	it("resolves a map entity index from the active map view state", async () => {
		const plugin = await createPlugin();
		const resolvedMap = { folderPath: "World" };
		plugin.app.workspace.getActiveFile = vi.fn(() => null);
		plugin.app.workspace.activeLeaf = {
			getViewState: vi.fn(() => ({
				type: OTHERWORLD_MAP_VIEW_TYPE,
				state: {
					folderPath: "World",
				},
			})),
		};
		plugin.discoveryService.resolveFromAbstractFile = vi.fn(() => null);
		plugin.discoveryService.resolveFromFolderPath = vi.fn(() => resolvedMap);

		const result = plugin.resolveMapForIndex();

		expect(result).toBe(resolvedMap);
		expect(plugin.discoveryService.resolveFromFolderPath).toHaveBeenCalledWith("World");
	});

	it("shows the no-map notice when generating an index without map context", async () => {
		const plugin = await createPlugin();
		plugin.resolveMapForIndex = vi.fn(() => null);

		await plugin.generateMapEntityIndex();

		expect(getMockNotices()).toEqual([NO_MAP_NOTICE]);
		expect(plugin.app.vault.create).not.toHaveBeenCalled();
		expect(plugin.app.vault.modify).not.toHaveBeenCalled();
	});

	it("shows the generated index notice after generating an index", async () => {
		const plugin = await createPlugin();
		const resolvedMap = createResolvedMap();
		plugin.resolveMapForIndex = vi.fn(() => resolvedMap);
		plugin.app.metadataCache.getFileCache.mockReturnValue({
			frontmatter: {
				worldbuildingMap: {
					pins: [],
				},
			},
		});
		plugin.app.vault.create.mockResolvedValue(undefined);

		await plugin.generateMapEntityIndex();

		expect(getMockNotices()).toContain("Generated World/World Index.md: 0 indexed entries.");
	});

	it("logs index generation failures and shows a short notice", async () => {
		const plugin = await createPlugin();
		const resolvedMap = createResolvedMap();
		const error = new Error("Internal write failure with implementation details.");
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		plugin.resolveMapForIndex = vi.fn(() => resolvedMap);
		plugin.app.metadataCache.getFileCache.mockReturnValue({
			frontmatter: {
				worldbuildingMap: {
					pins: [],
				},
			},
		});
		plugin.app.vault.create.mockRejectedValue(error);

		await plugin.generateMapEntityIndex();

		expect(consoleError).toHaveBeenCalledWith("Unable to generate map entity index", error);
		expect(getMockNotices()).toEqual([INDEX_ERROR_NOTICE]);
	});

	it("reuses an existing map leaf for the same folder", async () => {
		const plugin = await createPlugin();
		const existingLeaf = {
			getViewState: vi.fn(() => ({
				state: {
					folderPath: "World",
				},
			})),
		};
		plugin.app.workspace.getLeavesOfType.mockReturnValue([existingLeaf]);

		await plugin.openResolvedMap({
			folderPath: "World",
		} as ResolvedMap);

		expect(plugin.app.workspace.getLeavesOfType).toHaveBeenCalledWith(OTHERWORLD_MAP_VIEW_TYPE);
		expect(plugin.app.workspace.revealLeaf).toHaveBeenCalledWith(existingLeaf);
		expect(plugin.app.workspace.setActiveLeaf).toHaveBeenCalledWith(existingLeaf, { focus: true });
		expect(plugin.app.workspace.revealLeaf.mock.invocationCallOrder[0])
			.toBeLessThan(plugin.app.workspace.setActiveLeaf.mock.invocationCallOrder[0]);
		expect(plugin.app.workspace.getLeaf).not.toHaveBeenCalled();
	});

	it("does not create metadata or open a map when image auto-create is disabled", async () => {
		const plugin = await createPlugin();
		const world = folder("World", "World");
		const image = file("World.png", "World/World.png", world);
		plugin.discoveryService.resolveFromFile.mockReturnValue(null);

		await plugin.openMapForOpenedImage(image);

		expect(plugin.app.vault.getAbstractFileByPath).toHaveBeenCalledWith("World/World.md");
		expect(plugin.discoveryService.resolveFromFile).not.toHaveBeenCalled();
		expect(plugin.app.vault.create).not.toHaveBeenCalled();
		expect(plugin.app.workspace.getLeaf).not.toHaveBeenCalled();
		expect(plugin.app.workspace.revealLeaf).not.toHaveBeenCalled();
	});

	it("does not open an ancestor map when image metadata is missing and auto-create is disabled", async () => {
		const plugin = await createPlugin();
		const region = folder("Region", "World/Region");
		const image = file("Region.png", "World/Region/Region.png", region);
		plugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
		plugin.discoveryService.resolveFromFile.mockReturnValue({
			folderPath: "World",
		});

		await plugin.openMapForOpenedImage(image);

		expect(plugin.app.vault.getAbstractFileByPath).toHaveBeenCalledWith("World/Region/Region.md");
		expect(plugin.discoveryService.resolveFromFile).not.toHaveBeenCalled();
		expect(plugin.app.vault.create).not.toHaveBeenCalled();
		expect(plugin.app.workspace.getLeaf).not.toHaveBeenCalled();
		expect(plugin.app.workspace.revealLeaf).not.toHaveBeenCalled();
	});

	it("creates direct image metadata before resolving an opened image", async () => {
		const plugin = await createPlugin();
		const region = folder("Region", "World/Region");
		const image = file("Region.png", "World/Region/Region.png", region);
		const metadata = file("Region.md", "World/Region/Region.md", region);
		const leaf = {
			setViewState: vi.fn(),
		};
		plugin.settings.autoCreateMapMetadataOnImageOpen = true;
		plugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
		plugin.app.vault.create.mockResolvedValue(metadata);
		plugin.app.workspace.getLeaf.mockReturnValue(leaf);
		plugin.discoveryService.resolveFromFile.mockReturnValue({
			folderPath: "World/Region",
		});

		await plugin.openMapForOpenedImage(image);

		expect(plugin.app.vault.create).toHaveBeenCalledWith(
			"World/Region/Region.md",
			expect.stringContaining("  image: Region.png"),
		);
		expect(plugin.discoveryService.resolveFromFile).toHaveBeenCalledOnce();
		expect(plugin.discoveryService.resolveFromFile).toHaveBeenCalledWith(image);
		expect(leaf.setViewState).toHaveBeenCalledWith({
			type: OTHERWORLD_MAP_VIEW_TYPE,
			active: true,
			state: {
				folderPath: "World/Region",
			},
		});
		expect(plugin.app.workspace.revealLeaf).toHaveBeenCalledWith(leaf);
		expect(plugin.app.workspace.setActiveLeaf).toHaveBeenCalledWith(leaf, { focus: true });
		expect(leaf.setViewState.mock.invocationCallOrder[0])
			.toBeLessThan(plugin.app.workspace.revealLeaf.mock.invocationCallOrder[0]);
		expect(plugin.app.workspace.revealLeaf.mock.invocationCallOrder[0])
			.toBeLessThan(plugin.app.workspace.setActiveLeaf.mock.invocationCallOrder[0]);
	});
});

function getFileOpenHandler(plugin: PluginUnderTest): FileOpenHandler {
	const call = plugin.app.workspace.on.mock.calls
		.find(([eventName]) => eventName === "file-open");
	const handler = call?.[1];

	expect(typeof handler).toBe("function");

	return handler as FileOpenHandler;
}

function createResolvedMap() {
	const world = folder("World", "World");

	return {
		folder: world,
		folderPath: "World",
		name: "World",
		metadataFile: file("World.md", "World/World.md", world),
		imageFile: file("World.png", "World/World.png", world),
	};
}
