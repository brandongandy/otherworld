export class ItemView {
	app: unknown;
	contentEl = {};
	navigation = false;

	constructor(leaf: { app?: unknown } = {}) {
		this.app = leaf.app;
	}

	getState(): Record<string, unknown> {
		return {};
	}

	async setState(): Promise<void> {
		return undefined;
	}

	registerEvent(): void {
		return undefined;
	}
}

export class Modal {
	contentEl = createMockElement();
	closed = false;

	constructor(readonly app: unknown) {}

	open(): void {
		return undefined;
	}

	close(): void {
		this.closed = true;
		return undefined;
	}

	onOpen(): void {
		return undefined;
	}

	onClose(): void {
		return undefined;
	}
}

export class Notice {
	constructor(readonly message: string) {
		mockNotices.push(message);
	}
}

export class Menu {
	items: MockMenuItem[] = [];
	shownAtMouseEvent: unknown = null;

	constructor() {
		mockMenus.push(this);
	}

	addItem(callback: (item: MockMenuItem) => void): this {
		const item = new MockMenuItem();
		this.items.push(item);
		callback(item);
		return this;
	}

	showAtMouseEvent(event: unknown): void {
		this.shownAtMouseEvent = event;
	}
}

export class MockMenuItem {
	title = "";
	icon = "";
	private clickHandler: (() => void) | null = null;

	setTitle(title: string): this {
		this.title = title;
		return this;
	}

	setIcon(icon: string): this {
		this.icon = icon;
		return this;
	}

	onClick(callback: () => void): this {
		this.clickHandler = callback;
		return this;
	}

	click(): void {
		this.clickHandler?.();
	}
}

export class Plugin {}

export class PluginSettingTab {
	containerEl = createMockElement();

	constructor(readonly app: unknown, readonly plugin: unknown) {}
}

export class Setting {
	name = "";

	constructor(readonly containerEl: unknown) {
		mockSettings.push(this);
	}

	setName(name: string): this {
		this.name = name;
		return this;
	}

	setDesc(): this {
		return this;
	}

	addToggle(callback: (toggle: MockToggleComponent) => void): this {
		const toggle = new MockToggleComponent();
		mockToggleComponents.push(toggle);
		callback(toggle);
		return this;
	}

	addText(callback: (text: MockTextComponent) => void): this {
		const text = new MockTextComponent();
		mockTextComponents.push(text);
		callback(text);
		return this;
	}

	addDropdown(callback: (dropdown: MockDropdownComponent) => void): this {
		const dropdown = new MockDropdownComponent();
		mockDropdownComponents.push(dropdown);
		callback(dropdown);
		return this;
	}

	addButton(callback: (button: MockButtonComponent) => void): this {
		const button = new MockButtonComponent();
		mockButtonComponents.push(button);
		callback(button);
		return this;
	}
}

export function setIcon(): void {
	return undefined;
}

export function resetObsidianMocks(): void {
	mockSettings.length = 0;
	mockToggleComponents.length = 0;
	mockTextComponents.length = 0;
	mockDropdownComponents.length = 0;
	mockButtonComponents.length = 0;
	mockNotices.length = 0;
	mockMenus.length = 0;
}

export function getMockSettings(): Setting[] {
	return mockSettings;
}

export function getMockToggleComponents(): MockToggleComponent[] {
	return mockToggleComponents;
}

export function getMockTextComponents(): MockTextComponent[] {
	return mockTextComponents;
}

export function getMockDropdownComponents(): MockDropdownComponent[] {
	return mockDropdownComponents;
}

export function getMockButtonComponents(): MockButtonComponent[] {
	return mockButtonComponents;
}

export function getMockNotices(): string[] {
	return mockNotices;
}

export function getMockMenus(): Menu[] {
	return mockMenus;
}

const mockSettings: Setting[] = [];
const mockToggleComponents: MockToggleComponent[] = [];
const mockTextComponents: MockTextComponent[] = [];
const mockDropdownComponents: MockDropdownComponent[] = [];
const mockButtonComponents: MockButtonComponent[] = [];
const mockNotices: string[] = [];
const mockMenus: Menu[] = [];

export class MockToggleComponent {
	value = false;
	private changeHandler: ((value: boolean) => void) | null = null;

	setValue(value: boolean): this {
		this.value = value;
		return this;
	}

	onChange(callback: (value: boolean) => void): this {
		this.changeHandler = callback;
		return this;
	}

	setSelectedValue(value: boolean): void {
		this.value = value;
		this.changeHandler?.(value);
	}
}

export class MockTextComponent {
	value = "";
	private changeHandler: ((value: string) => void) | null = null;

	setPlaceholder(): this {
		return this;
	}

	onChange(callback: (value: string) => void): this {
		this.changeHandler = callback;
		return this;
	}

	setValue(value: string): this {
		this.value = value;

		if (this.changeHandler) {
			this.changeHandler(value);
		}

		return this;
	}
}

export class MockDropdownComponent {
	options: Array<{ value: string; label: string }> = [];
	value = "";
	private changeHandler: ((value: string) => void) | null = null;

	addOption(value: string, label: string): this {
		this.options.push({ value, label });
		return this;
	}

	setValue(value: string): this {
		this.value = value;
		return this;
	}

	onChange(callback: (value: string) => void): this {
		this.changeHandler = callback;
		return this;
	}

	setSelectedValue(value: string): void {
		this.value = value;

		if (this.changeHandler) {
			this.changeHandler(value);
		}
	}
}

export class MockButtonComponent {
	disabled = false;
	private clickHandler: (() => void) | null = null;

	setButtonText(): this {
		return this;
	}

	setCta(): this {
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.disabled = disabled;
		return this;
	}

	onClick(callback: () => void): this {
		this.clickHandler = callback;
		return this;
	}

	click(): void {
		if (this.clickHandler) {
			this.clickHandler();
		}
	}
}

function createMockElement() {
	let text = "";

	return {
		get text(): string {
			return text;
		},
		empty(): void {
			text = "";
			return undefined;
		},
		createDiv(): ReturnType<typeof createMockElement> {
			return createMockElement();
		},
		createEl(): ReturnType<typeof createMockElement> {
			return createMockElement();
		},
		addClass(): void {
			return undefined;
		},
		setText(value: string): void {
			text = value;
			return undefined;
		},
	};
}
