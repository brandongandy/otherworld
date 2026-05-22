import {
	Notice,
	Plugin,
	type TAbstractFile,
	type TFile,
	type WorkspaceLeaf,
} from "obsidian";
import { MapDiscoveryService } from "./services/MapDiscoveryService";
import { MapEntityIndexService } from "./services/MapEntityIndexService";
import {
	createMapMetadataForImage,
	getMapMetadataPathForImage,
	isSameNameSupportedMapImage,
} from "./services/MapImageOpenService";
import { MapMetadataService } from "./services/MapMetadataService";
import { PinTargetService } from "./services/PinTargetService";
import {
	DEFAULT_SETTINGS,
	mergeSettings,
	type OtherworldSettings,
} from "./settings";
import { OtherworldSettingTab } from "./settingsTab";
import { OTHERWORLD_MAP_VIEW_TYPE, type ResolvedMap } from "./types";
import { MapView } from "./views/MapView";

const NO_MAP_NOTICE = "No worldbuilding map found for the current context.";
const INDEX_ERROR_NOTICE = "Unable to generate map entity index.";

export default class OtherworldPlugin extends Plugin {
	settings: OtherworldSettings = { ...DEFAULT_SETTINGS };
	private discoveryService: MapDiscoveryService;
	private queuedImageOpenTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;

	async onload() {
		await this.loadSettings();

		this.discoveryService = new MapDiscoveryService(this.app.vault);

		this.registerView(
			OTHERWORLD_MAP_VIEW_TYPE,
			(leaf) => new MapView(leaf, this),
		);

		this.addCommand({
			id: "open-worldbuilding-map",
			name: "Open worldbuilding map",
			callback: () => {
				void this.openMapForActiveFile();
			},
		});

		this.addCommand({
			id: "generate-map-entity-index",
			name: "Generate map entity index",
			callback: () => {
				void this.generateMapEntityIndex();
			},
		});

		this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
			if (!this.discoveryService.resolveFromAbstractFile(file)) {
				return;
			}

			menu.addItem((item) => {
				item
					.setTitle("Open worldbuilding map")
					.setIcon("map")
					.onClick(() => {
						void this.openMapForFile(file);
					});
			});
		}));

		this.registerEvent(this.app.workspace.on("file-open", (file) => {
			this.queueOpenMapForOpenedImage(file);
		}));

		this.addSettingTab(new OtherworldSettingTab(this));
	}

	// eslint-disable-next-line obsidianmd/detach-leaves -- Saved vertical-slice plan requires detaching map leaves on unload.
	onunload() {
		this.clearQueuedImageOpen();
		this.app.workspace.detachLeavesOfType(OTHERWORLD_MAP_VIEW_TYPE);
	}

	async loadSettings(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async openMapForActiveFile(): Promise<void> {
		await this.openMapForFile(this.app.workspace.getActiveFile());
	}

	private async openMapForFile(file: TAbstractFile | null): Promise<void> {
		const resolvedMap = this.discoveryService.resolveFromAbstractFile(file);

		if (!resolvedMap) {
			new Notice(NO_MAP_NOTICE);
			return;
		}

		await this.openResolvedMap(resolvedMap);
	}

	async generateMapEntityIndex(): Promise<void> {
		const resolvedMap = this.resolveMapForIndex();

		if (!resolvedMap) {
			new Notice(NO_MAP_NOTICE);
			return;
		}

		const metadataService = new MapMetadataService(this.app);
		const targetService = new PinTargetService(this.app);
		const service = new MapEntityIndexService({
			vault: this.app.vault,
			loadMapMetadata: (file) => metadataService.loadMetadata(file),
			loadFrontmatter: (file) => this.app.metadataCache.getFileCache(file)?.frontmatter,
			resolveTarget: (target, sourcePath) => targetService.resolve(target, sourcePath),
		});

		try {
			const result = await service.generateIndex({
				map: resolvedMap,
				settings: this.settings,
			});
			new Notice(result.notice);
		} catch (error) {
			console.error("Unable to generate map entity index", error);
			new Notice(INDEX_ERROR_NOTICE);
		}
	}

	resolveMapForIndex(): ResolvedMap | null {
		const activeFileMap = this.discoveryService.resolveFromAbstractFile(this.app.workspace.getActiveFile());

		if (activeFileMap) {
			return activeFileMap;
		}

		const activeLeaf = this.app.workspace.activeLeaf;
		const viewState = activeLeaf?.getViewState?.();

		if (
			isRecord(viewState)
			&& viewState.type === OTHERWORLD_MAP_VIEW_TYPE
			&& isRecord(viewState.state)
			&& typeof viewState.state.folderPath === "string"
		) {
			return this.discoveryService.resolveFromFolderPath(viewState.state.folderPath);
		}

		return null;
	}

	private async openResolvedMap(resolvedMap: ResolvedMap): Promise<void> {
		const existingLeaf = this.findMapLeaf(resolvedMap.folderPath);

		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
			return;
		}

		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: OTHERWORLD_MAP_VIEW_TYPE,
			active: true,
			state: {
				folderPath: resolvedMap.folderPath,
			},
		});
		await this.app.workspace.revealLeaf(leaf);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
	}

	private async openMapForOpenedImage(file: TFile | null): Promise<void> {
		if (!isSameNameSupportedMapImage(file)) {
			return;
		}

		const metadataPath = getMapMetadataPathForImage(file);
		const hasDirectMetadata = isFile(this.app.vault.getAbstractFileByPath(metadataPath));

		if (!hasDirectMetadata) {
			if (!this.settings.autoCreateMapMetadataOnImageOpen) {
				return;
			}

			try {
				await createMapMetadataForImage(this.app.vault, file);
			} catch (error) {
				console.error("Unable to create map metadata", error);
				new Notice(`Unable to create map metadata: ${metadataPath}`);
				return;
			}
		}

		const resolvedMap = this.discoveryService.resolveFromFile(file);

		if (resolvedMap) {
			await this.openResolvedMap(resolvedMap);
		}
	}

	private queueOpenMapForOpenedImage(file: TFile | null): void {
		this.clearQueuedImageOpen();
		this.queuedImageOpenTimeout = globalThis.setTimeout(() => {
			this.queuedImageOpenTimeout = null;
			void this.openMapForOpenedImage(file);
		}, 0);
	}

	private clearQueuedImageOpen(): void {
		if (this.queuedImageOpenTimeout === null) {
			return;
		}

		globalThis.clearTimeout(this.queuedImageOpenTimeout);
		this.queuedImageOpenTimeout = null;
	}

	private findMapLeaf(folderPath: string): WorkspaceLeaf | null {
		for (const leaf of this.app.workspace.getLeavesOfType(OTHERWORLD_MAP_VIEW_TYPE)) {
			const state = leaf.getViewState().state;

			if (isRecord(state) && state.folderPath === folderPath) {
				return leaf;
			}
		}

		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFile(file: unknown): file is TFile {
	const maybeFile = file as { basename?: unknown; extension?: unknown } | null;
	return !!maybeFile
		&& typeof maybeFile.basename === "string"
		&& typeof maybeFile.extension === "string";
}
