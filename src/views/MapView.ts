import {
	ItemView,
	Menu,
	Notice,
	setIcon,
	type TFile,
	type ViewStateResult,
	type WorkspaceLeaf,
} from "obsidian";
import type OtherworldPlugin from "../main";
import {
	fitImageToViewport,
	screenToNormalizedPoint,
	type Size,
} from "../services/MapCoordinateService";
import { MapDiscoveryService } from "../services/MapDiscoveryService";
import { MapMetadataService } from "../services/MapMetadataService";
import { PinEditService, type EditPinResult } from "../services/PinEditService";
import { PinCreationService } from "../services/PinCreationService";
import { PinTargetService } from "../services/PinTargetService";
import { isPinType } from "../services/PinTypeService";
import { TemplateService, type TemplateOption } from "../services/TemplateService";
import { OTHERWORLD_MAP_VIEW_TYPE, type MapPin, type ResolvedMap } from "../types";
import { CreatePinModal } from "../ui/CreatePinModal";
import { EditPinModal } from "../ui/EditPinModal";
import {
	DEFAULT_TRANSFORM,
	panTransform,
	type ViewportTransform,
	zoomTransform,
} from "./viewportTransform";

interface MapViewState {
	folderPath?: unknown;
}

interface RenderOptions {
	preserveTransform?: boolean;
}

const DRAGGING_CLASS = "otherworld-map-view__stage--dragging";

export class MapView extends ItemView {
	private readonly discoveryService: MapDiscoveryService;
	private readonly metadataService: MapMetadataService;
	private readonly pinTargetService: PinTargetService;
	private readonly pinCreationService: PinCreationService;
	private readonly pinEditService: PinEditService;
	private readonly templateService: TemplateService;
	private folderPath: string | null = null;
	private metadataFilePath: string | null = null;
	private resolvedMap: ResolvedMap | null = null;
	private transform: ViewportTransform = { ...DEFAULT_TRANSFORM };
	private stageEl: HTMLElement | null = null;
	private layerEl: HTMLElement | null = null;
	private imageSize: Size | null = null;
	private isDragging = false;
	private lastPointerX = 0;
	private lastPointerY = 0;
	private renderToken = 0;
	private showPinLabels: boolean;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: OtherworldPlugin) {
		super(leaf);
		this.showPinLabels = plugin.settings?.showPinLabelsByDefault ?? true;
		this.discoveryService = new MapDiscoveryService(plugin.app.vault);
		this.metadataService = new MapMetadataService(plugin.app);
		this.pinTargetService = new PinTargetService(plugin.app);
		this.templateService = new TemplateService(plugin.app);
		this.pinCreationService = new PinCreationService({
			vault: plugin.app.vault,
			fileManager: plugin.app.fileManager,
			loadMetadata: (file) => this.metadataService.loadMetadata(file),
			loadRawFrontmatter: (file) => this.metadataService.loadRawFrontmatter(file),
			readTemplate: (templatePath) => this.templateService.readTemplate(templatePath),
			confirmParentLocationCreation: async ({ name, path }) => {
				return globalThis.confirm(`Create parent location note "${name}" at ${path}?`);
			},
		});
		this.pinEditService = new PinEditService({
			vault: plugin.app.vault,
			fileManager: plugin.app.fileManager,
		});
		this.navigation = true;
	}

	getViewType(): string {
		return OTHERWORLD_MAP_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Worldbuilding map";
	}

	getIcon(): string {
		return "map";
	}

	getState(): Record<string, unknown> {
		return {
			...super.getState(),
			folderPath: this.folderPath,
		};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		const viewState = isRecord(state) ? state as MapViewState : {};
		this.folderPath = typeof viewState.folderPath === "string" ? viewState.folderPath : null;
		await this.render();
	}

	protected async onOpen(): Promise<void> {
		this.contentEl.addClass("otherworld-map-view");
		this.registerEvent(this.app.metadataCache.on("changed", (file) => {
			if (file.path !== this.metadataFilePath) {
				return;
			}

			void this.render({ preserveTransform: true });
		}));
		await this.render();
	}

	protected async onClose(): Promise<void> {
		this.renderToken++;
		this.metadataFilePath = null;
		this.resolvedMap = null;
		this.resetInteractionState();
		this.contentEl.empty();
	}

	private async render(options: RenderOptions = {}): Promise<void> {
		const renderToken = ++this.renderToken;
		const preservedTransform = options.preserveTransform ? { ...this.transform } : null;
		this.resetInteractionState();
		this.resolvedMap = null;

		if (!this.contentEl || !this.folderPath) {
			this.metadataFilePath = null;
			return;
		}

		this.contentEl.empty();
		this.transform = preservedTransform ?? { ...DEFAULT_TRANSFORM };

		const resolvedMap = this.discoveryService.resolveFromFolderPath(this.folderPath);

		if (!resolvedMap) {
			this.metadataFilePath = null;
			this.renderError("Map files could not be found.");
			return;
		}

		this.metadataFilePath = resolvedMap.metadataFile.path;
		this.renderResolvedMap(resolvedMap, renderToken);
	}

	private renderResolvedMap(resolvedMap: ResolvedMap, renderToken: number): void {
		const metadata = this.metadataService.loadMetadata(resolvedMap.metadataFile);
		this.resolvedMap = resolvedMap;
		this.renderControls();
		const stageEl = this.contentEl.createDiv({ cls: "otherworld-map-view__stage" });
		const layerEl = stageEl.createDiv({ cls: "otherworld-map-view__layer" });
		const imageEl = layerEl.createEl("img", {
			cls: "otherworld-map-view__image",
			attr: {
				alt: resolvedMap.name,
				draggable: "false",
				src: this.app.vault.getResourcePath(resolvedMap.imageFile),
			},
		});

		this.stageEl = stageEl;
		this.layerEl = layerEl;
		this.applyTransform();

		imageEl.addEventListener("load", () => {
			if (!this.isCurrentRender(renderToken, layerEl)) {
				return;
			}

			this.syncLayerSize(imageEl);
		});

		imageEl.addEventListener("error", () => {
			if (!this.isCurrentRender(renderToken, layerEl)) {
				return;
			}

			this.renderError("Map image could not be loaded.");
		});

		if (imageEl.complete && this.isCurrentRender(renderToken, layerEl)) {
			this.syncLayerSize(imageEl);
		}

		for (const pin of metadata.pins) {
			this.renderPin(layerEl, pin);
		}

		this.bindStageEvents(stageEl);
	}

	private renderControls(): void {
		const controlsEl = this.contentEl.createDiv({ cls: "otherworld-map-view__controls" });

		const fitButton = controlsEl.createEl("button", {
			cls: "otherworld-map-view__control-button",
			attr: {
				"aria-label": "Fit map to view",
				title: "Fit map to view",
				type: "button",
			},
		});
		setIcon(fitButton, "maximize-2");
		fitButton.addEventListener("click", () => {
			this.fitMapToView();
		});

		const resetButton = controlsEl.createEl("button", {
			cls: "otherworld-map-view__control-button",
			attr: {
				"aria-label": "Reset map zoom",
				title: "Reset map zoom",
				type: "button",
			},
		});
		setIcon(resetButton, "rotate-ccw");
		resetButton.addEventListener("click", () => {
			this.resetMapZoom();
		});

		const labelsButton = controlsEl.createEl("button", {
			cls: `otherworld-map-view__control-button${this.showPinLabels ? " is-active" : ""}`,
			attr: {
				"aria-label": this.showPinLabels ? "Hide pin labels" : "Show pin labels",
				title: this.showPinLabels ? "Hide pin labels" : "Show pin labels",
				type: "button",
				"aria-pressed": String(this.showPinLabels),
			},
		});
		setIcon(labelsButton, "tags");
		labelsButton.addEventListener("click", () => {
			void this.togglePinLabels();
		});
	}

	private fitMapToView(): void {
		if (!this.stageEl || !this.imageSize) {
			this.resetMapZoom();
			return;
		}

		const rect = this.stageEl.getBoundingClientRect();
		this.transform = fitImageToViewport(this.imageSize, {
			width: rect.width,
			height: rect.height,
		});
		this.applyTransform();
	}

	private resetMapZoom(): void {
		this.transform = { ...DEFAULT_TRANSFORM };
		this.applyTransform();
	}

	private async togglePinLabels(): Promise<void> {
		this.showPinLabels = !this.showPinLabels;
		await this.render({ preserveTransform: true });
	}

	private bindStageEvents(stageEl: HTMLElement): void {
		stageEl.addEventListener("pointerdown", (event) => {
			if ((event.target as HTMLElement).closest(".otherworld-map-view__pin")) {
				return;
			}

			this.isDragging = true;
			this.lastPointerX = event.clientX;
			this.lastPointerY = event.clientY;
			stageEl.addClass(DRAGGING_CLASS);
			stageEl.setPointerCapture(event.pointerId);
		});

		stageEl.addEventListener("pointermove", (event) => {
			if (!this.isDragging) {
				return;
			}

			this.transform = panTransform(
				this.transform,
				event.clientX - this.lastPointerX,
				event.clientY - this.lastPointerY,
			);
			this.lastPointerX = event.clientX;
			this.lastPointerY = event.clientY;
			this.applyTransform();
		});

		const endDrag = (event: PointerEvent) => {
			if (!this.isDragging) {
				return;
			}

			this.isDragging = false;
			stageEl.removeClass(DRAGGING_CLASS);

			if (stageEl.hasPointerCapture(event.pointerId)) {
				stageEl.releasePointerCapture(event.pointerId);
			}
		};

		stageEl.addEventListener("pointerup", endDrag);
		stageEl.addEventListener("pointercancel", endDrag);

		stageEl.addEventListener("wheel", (event) => {
			event.preventDefault();
			const rect = stageEl.getBoundingClientRect();
			this.transform = zoomTransform(
				this.transform,
				event.deltaY,
				event.clientX - rect.left,
				event.clientY - rect.top,
			);
			this.applyTransform();
		}, { passive: false });

		stageEl.addEventListener("dblclick", (event) => {
			if ((event.target as HTMLElement).closest(".otherworld-map-view__pin")) {
				return;
			}

			void this.openCreatePinModal(event, stageEl);
		});
	}

	private async openCreatePinModal(event: MouseEvent, stageEl: HTMLElement): Promise<void> {
		if (!this.resolvedMap || !this.imageSize) {
			return;
		}

		const rect = stageEl.getBoundingClientRect();
		const point = screenToNormalizedPoint(
			{
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			},
			this.imageSize,
			this.transform,
		);

		if (!point) {
			return;
		}

		new CreatePinModal(this.app, {
			map: this.resolvedMap,
			point,
			templates: this.listTemplateOptions(),
			defaultSubtypes: this.plugin.settings.defaultSubtypes,
			createPin: (request) => {
				const settingsType = isPinType(request.type) ? request.type : "location";

				return this.pinCreationService.createPin({
					...request,
					entityFolderPath: this.plugin.settings.entityFolders[settingsType],
					locationFolderPath: this.plugin.settings.entityFolders.location,
					parentLocationCreation: this.plugin.settings.parentLocationCreation,
				});
			},
			onCreated: async () => {
				await this.render({ preserveTransform: true });
			},
		}).open();
	}

	private listTemplateOptions(): TemplateOption[] {
		try {
			return this.templateService.listTemplateOptions();
		} catch (error) {
			console.error("Unable to load template options", error);
			return [];
		}
	}

	private renderPin(layerEl: HTMLElement, pin: MapPin): void {
		const pinEl = layerEl.createEl("button", {
			cls: "otherworld-map-view__pin",
			attr: {
				"aria-label": pin.name,
				title: pin.name,
				type: "button",
			},
		});
		pinEl.style.left = `${pin.x * 100}%`;
		pinEl.style.top = `${pin.y * 100}%`;
		pinEl.createSpan({ cls: "otherworld-map-view__pin-dot" });

		if (this.showPinLabels) {
			pinEl.createSpan({
				cls: "otherworld-map-view__pin-label",
				text: pin.name,
			});
		}

		pinEl.addEventListener("click", (event) => {
			event.stopPropagation();

			if (isEditClick(event)) {
				event.preventDefault();
				this.openEditPinModal(pin);
				return;
			}

			void this.openPinTarget(pin);
		});

		pinEl.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.openPinContextMenu(pin, event);
		});
	}

	private openEditPinModal(pin: MapPin): void {
		if (!this.resolvedMap) {
			return;
		}

		new EditPinModal(this.app, {
			map: this.resolvedMap,
			pin,
			savePin: (request) => this.pinEditService.editPin(request),
			onSaved: async (result) => {
				await this.handlePinEditSaved(result);
			},
		}).open();
	}

	private async handlePinEditSaved(result: EditPinResult): Promise<void> {
		if (result.warning) {
			new Notice(result.warning);
		}

		await this.render({ preserveTransform: true });
	}

	private openPinContextMenu(pin: MapPin, event: MouseEvent): void {
		const menu = new Menu();

		menu.addItem((item) => {
			item
				.setTitle("Edit pin")
				.setIcon("pencil")
				.onClick(() => {
					this.openEditPinModal(pin);
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("Open note")
				.setIcon("file-text")
				.onClick(() => {
					void this.openPinTarget(pin);
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("Reveal note")
				.setIcon("folder-open")
				.onClick(() => {
					void this.revealPinTarget(pin);
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("Copy wikilink")
				.setIcon("copy")
				.onClick(() => {
					void this.copyPinWikilink(pin);
				});
		});

		menu.showAtMouseEvent(event);
	}

	private async copyPinWikilink(pin: MapPin): Promise<void> {
		const clipboard = globalThis.navigator?.clipboard;
		const writeText = clipboard?.writeText;

		if (typeof writeText !== "function") {
			new Notice("Clipboard is not available.");
			return;
		}

		try {
			await writeText.call(clipboard, pin.link);
		} catch {
			new Notice("Unable to copy wikilink.");
		}
	}

	private async openPinTarget(pin: MapPin): Promise<void> {
		const target = this.pinTargetService.resolve(pin.entityPath, this.metadataFilePath ?? "");

		if (!isFile(target)) {
			new Notice(`Map pin target not found: ${pin.entityPath}`);
			return;
		}

		await this.app.workspace.getLeaf(false).openFile(target);
	}

	private async revealPinTarget(pin: MapPin): Promise<void> {
		const target = this.pinTargetService.resolve(pin.entityPath, this.metadataFilePath ?? "");

		if (!isFile(target)) {
			new Notice(`Map pin target not found: ${pin.entityPath}`);
			return;
		}

		await this.app.workspace.getLeaf(false).openFile(target);

		if (!executeCommandById(this.app, "file-explorer:reveal-active-file")) {
			new Notice("Opened note, but file explorer reveal is not available.");
		}
	}

	private syncLayerSize(imageEl: HTMLImageElement): void {
		if (!this.layerEl || imageEl.naturalWidth === 0 || imageEl.naturalHeight === 0) {
			return;
		}

		this.imageSize = {
			width: imageEl.naturalWidth,
			height: imageEl.naturalHeight,
		};
		this.layerEl.style.width = `${imageEl.naturalWidth}px`;
		this.layerEl.style.height = `${imageEl.naturalHeight}px`;
	}

	private applyTransform(): void {
		if (!this.layerEl) {
			return;
		}

		this.layerEl.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
	}

	private resetInteractionState(): void {
		this.isDragging = false;
		this.stageEl = null;
		this.layerEl = null;
		this.imageSize = null;
		this.lastPointerX = 0;
		this.lastPointerY = 0;
	}

	private isCurrentRender(renderToken: number, layerEl: HTMLElement): boolean {
		return renderToken === this.renderToken && this.layerEl === layerEl;
	}

	private renderError(message: string): void {
		this.contentEl.empty();
		this.contentEl.createDiv({
			cls: "otherworld-map-view__error",
			text: message,
		});
	}
}

function isFile(file: unknown): file is TFile {
	const maybeFile = file as { basename?: unknown; extension?: unknown } | null;
	return !!maybeFile
		&& typeof maybeFile.basename === "string"
		&& typeof maybeFile.extension === "string";
}

function isEditClick(event: MouseEvent): boolean {
	return event.metaKey || event.ctrlKey;
}

function executeCommandById(app: unknown, commandId: string): boolean {
	const commands = (app as {
		commands?: {
			executeCommandById?: (id: string) => unknown;
		};
	}).commands;
	const execute = commands?.executeCommandById;

	if (typeof execute !== "function") {
		return false;
	}

	const result = execute.call(commands, commandId);
	return result !== false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
