import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_ENTITY_NOTE_BODY,
	SELECTED_TEMPLATE_NOT_FOUND_MESSAGE,
	TemplateService,
	renderTemplateContent,
} from "../src/services/TemplateService";

interface FakeFolder {
	name: string;
	path: string;
	children: Array<FakeFolder | FakeFile>;
}

interface FakeFile {
	name: string;
	basename: string;
	extension: string;
	path: string;
	parent: FakeFolder | null;
	content: string;
}

describe("TemplateService", () => {
	it("returns no templates when the core templates folder is not configured", () => {
		const service = new TemplateService(createApp());

		expect(service.listTemplateOptions()).toEqual([]);
	});

	it("returns no templates when the core templates plugin is disabled", () => {
		const service = new TemplateService(createApp({
			templatesFolder: "Templates",
			templatesEnabled: false,
			files: [
				folder("Templates", "Templates", [
					file("Location.md", "Templates/Location.md"),
				]),
			],
		}));

		expect(service.listTemplateOptions()).toEqual([]);
	});

	it("returns no templates when the configured path is missing or not a folder", () => {
		const app = createApp({
			templatesFolder: "Templates",
			files: [
				file("Templates.md", "Templates.md"),
			],
		});
		const service = new TemplateService(app);

		expect(service.listTemplateOptions()).toEqual([]);

		const fileApp = createApp({
			templatesFolder: "Templates.md",
			files: [
				file("Templates.md", "Templates.md"),
			],
		});
		const fileService = new TemplateService(fileApp);

		expect(fileService.listTemplateOptions()).toEqual([]);
	});

	it("lists markdown templates recursively inside the configured folder sorted by name", () => {
		const templates = folder("Templates", "Templates", [
			file("Location.md", "Templates/Location.md"),
			file("Event.md", "Templates/Event.md"),
			file("Readme.txt", "Templates/Readme.txt"),
			folder("Nested", "Templates/Nested", [
				file("Nested.md", "Templates/Nested/Nested.md"),
				file("Location - City.md", "Templates/Nested/Location - City.md"),
			]),
			file("battle.md", "Templates/battle.md"),
		]);
		const service = new TemplateService(createApp({
			templatesFolder: "Templates",
			files: [templates],
		}));

		expect(service.listTemplateOptions()).toEqual([
			{ path: "Templates/battle.md", name: "battle" },
			{ path: "Templates/Event.md", name: "Event" },
			{ path: "Templates/Location.md", name: "Location" },
			{ path: "Templates/Nested/Location - City.md", name: "Location - City" },
			{ path: "Templates/Nested/Nested.md", name: "Nested" },
		]);
	});

	it("sorts template names deterministically when names only differ by case", () => {
		const templates = folder("Templates", "Templates", [
			file("Alpha.md", "Templates/Alpha.md"),
			file("alpha.md", "Templates/alpha.md"),
		]);
		const service = new TemplateService(createApp({
			templatesFolder: "Templates",
			files: [templates],
		}));

		expect(service.listTemplateOptions()).toEqual([
			{ path: "Templates/alpha.md", name: "alpha" },
			{ path: "Templates/Alpha.md", name: "Alpha" },
		]);
	});

	it("reads a selected markdown template", async () => {
		const template = file("Location.md", "Templates/Location.md", "# {{name}}");
		const service = new TemplateService(createApp({
			templatesFolder: "Templates",
			files: [folder("Templates", "Templates", [template])],
		}));

		await expect(service.readTemplate("Templates/Location.md")).resolves.toBe("# {{name}}");
	});

	it("rejects missing or non-markdown selected templates", async () => {
		const template = file("Location.txt", "Templates/Location.txt", "text");
		const service = new TemplateService(createApp({
			templatesFolder: "Templates",
			files: [folder("Templates", "Templates", [template])],
		}));

		await expect(service.readTemplate("Templates/Missing.md"))
			.rejects.toThrow(SELECTED_TEMPLATE_NOT_FOUND_MESSAGE);
		await expect(service.readTemplate("Templates/Location.txt"))
			.rejects.toThrow(SELECTED_TEMPLATE_NOT_FOUND_MESSAGE);
	});

	it("renders supported tokens and leaves unknown tokens unchanged", () => {
		expect(renderTemplateContent([
			"# {{name}}",
			"Type: {{type}}",
			"Subtype: {{subtype}}",
			"Map: {{map}}",
			"Map path: {{mapPath}}",
			"Point: {{x}}, {{y}}",
			"Pin: {{pinId}}",
			"Parent: {{parentLocation}}",
			"Nation: {{nation}}",
			"Region: {{region}}",
			"Unknown: {{storyArc}}",
		].join("\n"), {
			name: "Aldmere",
			type: "location",
			subtype: "city",
			map: "World",
			mapPath: "World/World.md",
			x: 0.421,
			y: 0.337,
			pinId: "world__location__aldmere",
			parentLocation: "[[Northern Marches]]",
			nation: "[[Valoria]]",
			region: "[[Northern Marches]]",
		})).toBe([
			"# Aldmere",
			"Type: location",
			"Subtype: city",
			"Map: World",
			"Map path: World/World.md",
			"Point: 0.421, 0.337",
			"Pin: world__location__aldmere",
			"Parent: [[Northern Marches]]",
			"Nation: [[Valoria]]",
			"Region: [[Northern Marches]]",
			"Unknown: {{storyArc}}",
		].join("\n"));
	});

	it("renders missing optional values as empty strings", () => {
		expect(renderTemplateContent(DEFAULT_ENTITY_NOTE_BODY, {
			name: "Aldmere",
			type: "location",
			map: "World",
			mapPath: "World/World.md",
			x: 0.421,
			y: 0.337,
			pinId: "world__location__aldmere",
		})).toBe([
			"# Aldmere",
			"",
			"## Description",
			"",
			"## Notes",
		].join("\n"));
	});
});

function createApp(options: {
	templatesFolder?: string;
	templatesEnabled?: boolean;
	files?: Array<FakeFolder | FakeFile>;
} = {}) {
	const filesByPath = new Map<string, FakeFolder | FakeFile>();

	for (const file of options.files ?? []) {
		indexFile(file, filesByPath);
	}

	return {
		internalPlugins: options.templatesFolder
			? {
				plugins: {
					templates: {
						enabled: options.templatesEnabled ?? true,
						instance: {
							options: {
								folder: options.templatesFolder,
							},
						},
					},
				},
			}
			: undefined,
		vault: {
			getAbstractFileByPath: vi.fn((path: string) => filesByPath.get(path) ?? null),
			read: vi.fn(async (file: FakeFile) => file.content ?? ""),
		},
	} as never;
}

function folder(name: string, path: string, children: Array<FakeFolder | FakeFile> = []): FakeFolder {
	return { name, path, children };
}

function file(name: string, path: string, content = ""): FakeFile {
	const extensionStart = name.lastIndexOf(".");
	return {
		name,
		basename: extensionStart === -1 ? name : name.slice(0, extensionStart),
		extension: extensionStart === -1 ? "" : name.slice(extensionStart + 1),
		path,
		parent: null,
		content,
	};
}

function indexFile(file: FakeFolder | FakeFile, filesByPath: Map<string, FakeFolder | FakeFile>): void {
	filesByPath.set(file.path, file);

	if ("children" in file) {
		for (const child of file.children) {
			indexFile(child, filesByPath);
		}
	}
}
