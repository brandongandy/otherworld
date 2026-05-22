import { describe, expect, it, vi } from "vitest";
import {
	buildEntityPath,
	ensureVaultFolderPath,
} from "../src/services/EntityFolderService";

interface FakeFolder {
	name: string;
	path: string;
	children: unknown[];
}

interface FakeFile {
	name: string;
	path: string;
	extension: string;
}

describe("EntityFolderService", () => {
	it("builds entity paths inside configured folders", () => {
		expect(buildEntityPath("Locations", "Aldmere")).toEqual({
			displayName: "Aldmere",
			basename: "Aldmere",
			entityPath: "Locations/Aldmere.md",
		});
		expect(buildEntityPath("", "Aldmere")).toEqual({
			displayName: "Aldmere",
			basename: "Aldmere",
			entityPath: "Aldmere.md",
		});
	});

	it("returns null when the entity name cannot produce a filename", () => {
		expect(buildEntityPath("Locations", "???")).toBeNull();
	});

	it("sanitizes entity names that contain traversal segments", () => {
		expect(buildEntityPath("Locations", "../Aldmere")).toEqual({
			displayName: "../Aldmere",
			basename: "Aldmere",
			entityPath: "Locations/Aldmere.md",
		});
	});

	it.each([
		".",
		"..",
		"../People",
		"Groups/../Secrets",
	])("returns null when the configured folder path contains unsafe segments: %s", (folderPath) => {
		expect(buildEntityPath(folderPath, "Aldmere")).toBeNull();
	});

	it("creates each missing folder segment", async () => {
		const files = new Map<string, FakeFolder | FakeFile>();
		const vault = createVault(files);

		await ensureVaultFolderPath(vault, "World/Locations");

		expect(vault.createFolder).toHaveBeenCalledWith("World");
		expect(vault.createFolder).toHaveBeenCalledWith("World/Locations");
		expect(files.get("World")).toMatchObject({ path: "World" });
		expect(files.get("World/Locations")).toMatchObject({ path: "World/Locations" });
	});

	it("does nothing for the vault root", async () => {
		const files = new Map<string, FakeFolder | FakeFile>();
		const vault = createVault(files);

		await ensureVaultFolderPath(vault, "");

		expect(vault.createFolder).not.toHaveBeenCalled();
	});

	it.each([
		[".", "."],
		["..", ".."],
		["../People", "../People"],
		["Groups/../Secrets", "Groups/../Secrets"],
	])("rejects when the configured folder path contains unsafe segments: %s", async (folderPath, normalizedPath) => {
		const files = new Map<string, FakeFolder | FakeFile>();
		const vault = createVault(files);

		await expectExactRejectionMessage(
			() => ensureVaultFolderPath(vault, folderPath),
			`Configured output folder path contains unsafe segments: ${normalizedPath}`,
		);
		expect(vault.createFolder).not.toHaveBeenCalled();
	});

	it("rejects when a path segment exists but is not a folder", async () => {
		const files = new Map<string, FakeFolder | FakeFile>([
			["World", { name: "World", path: "World", extension: "md" }],
		]);
		const vault = createVault(files);

		await expectExactRejectionMessage(
			() => ensureVaultFolderPath(vault, "World/Locations"),
			"Configured output folder path exists but is not a folder: World",
		);
		expect(vault.createFolder).not.toHaveBeenCalled();
	});
});

function createVault(files: Map<string, FakeFolder | FakeFile>) {
	return {
		getAbstractFileByPath: vi.fn((path: string) => files.get(path) ?? null),
		createFolder: vi.fn(async (path: string) => {
			const name = path.split("/").pop() ?? path;
			files.set(path, { name, path, children: [] });
		}),
	};
}

async function expectExactRejectionMessage(action: () => Promise<unknown>, message: string): Promise<void> {
	try {
		await action();
	} catch (error) {
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe(message);
		return;
	}

	throw new Error("Expected action to reject.");
}
