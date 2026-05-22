import { describe, expect, it, vi } from "vitest";
import type { MapPin } from "../src/types";
import { MapView } from "../src/views/MapView";

describe("MapView pin labels", () => {
	it("initializes label visibility from plugin settings", () => {
		const view = createMapView({ showPinLabelsByDefault: false });

		expect((view as unknown as { showPinLabels: boolean }).showPinLabels).toBe(false);
	});

	it("renders a label for each pin by default", () => {
		const view = createMapView();
		const layer = createFakeLayer();

		callPrivate(view, "renderPin", layer, createPin());

		expect(layer.createdButtons[0]?.children).toContainEqual({
			kind: "span",
			cls: "otherworld-map-view__pin-label",
			text: "Aldmere",
		});
	});

	it("omits pin labels when labels are hidden", () => {
		const view = createMapView();
		(view as unknown as { showPinLabels: boolean }).showPinLabels = false;
		const layer = createFakeLayer();

		callPrivate(view, "renderPin", layer, createPin());

		expect(layer.createdButtons[0]?.children).not.toContainEqual({
			kind: "span",
			cls: "otherworld-map-view__pin-label",
			text: "Aldmere",
		});
	});

	it("toggles label visibility and refreshes without resetting transform", () => {
		const view = createMapView();
		const render = vi.fn();
		(view as unknown as { render: typeof render }).render = render;

		callPrivate(view, "togglePinLabels");

		expect((view as unknown as { showPinLabels: boolean }).showPinLabels).toBe(false);
		expect(render).toHaveBeenCalledWith({ preserveTransform: true });
	});
});

function createMapView(settings: { showPinLabelsByDefault?: boolean } = {}): MapView {
	const app = {
		fileManager: {},
		metadataCache: {
			getFileCache: vi.fn(),
			getFirstLinkpathDest: vi.fn(),
		},
		vault: {
			getAbstractFileByPath: vi.fn(),
			getResourcePath: vi.fn(),
		},
		workspace: {
			getLeaf: vi.fn(),
		},
	};
	const leaf = { app };
	const plugin = {
		app,
		settings: {
			showPinLabelsByDefault: settings.showPinLabelsByDefault ?? true,
		},
	};

	return new MapView(leaf as never, plugin as never);
}

function createPin(): MapPin {
	return {
		id: "world__location__aldmere",
		name: "Aldmere",
		link: "[[Aldmere]]",
		entityPath: "World/Aldmere.md",
		type: "location",
		x: 0.25,
		y: 0.5,
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
	readonly children: Array<{ kind: string; cls: string; text?: string }> = [];
	readonly style: Record<string, string> = {};
	private readonly listeners = new Map<string, Array<(event: never) => void>>();

	constructor(
		readonly tag: string,
		readonly options: { cls: string; attr: Record<string, string> },
	) {
	}

	createSpan(options: { cls: string; text?: string }): void {
		this.children.push({
			kind: "span",
			cls: options.cls,
			text: options.text,
		});
	}

	addEventListener(type: string, listener: (event: never) => void): void {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}
}

function callPrivate<TArgs extends unknown[]>(
	target: unknown,
	methodName: string,
	...args: TArgs
): unknown {
	const method = (target as Record<string, (...methodArgs: TArgs) => unknown>)[methodName];
	return method.apply(target, args);
}
