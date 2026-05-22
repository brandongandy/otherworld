export function readWikiLinkTarget(value: string): string {
	const linkBody = readWikiLinkBody(value);
	const aliasIndex = linkBody.indexOf("|");
	return normalizeLinkPath(aliasIndex === -1 ? linkBody : linkBody.slice(0, aliasIndex));
}

export function readWikiLinkDisplayText(value: string): string {
	const linkBody = readWikiLinkBody(value);
	const aliasIndex = linkBody.indexOf("|");
	const alias = aliasIndex === -1 ? undefined : linkBody.slice(aliasIndex + 1);

	if (alias !== undefined && trimOptionalText(alias)) {
		return alias;
	}

	return basenameWithoutMarkdownExtension(readWikiLinkTarget(value));
}

export function buildWikiLink(target: string): string {
	return `[[${stripMarkdownExtension(readWikiLinkTarget(target)).replace(/[[\]]/g, "").trim()}]]`;
}

export function wikiLinkKey(value: string): string {
	return stripMarkdownExtension(readWikiLinkTarget(value)).toLowerCase();
}

function readWikiLinkBody(value: string): string {
	const trimmed = value.trim();
	const match = /^\[\[([^\]]+)]]$/.exec(trimmed);
	return match?.[1] ?? trimmed;
}

function normalizeLinkPath(value: string): string {
	return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function stripMarkdownExtension(value: string): string {
	return value.replace(/\.md$/i, "");
}

function basenameWithoutMarkdownExtension(value: string): string {
	const normalized = stripMarkdownExtension(value);
	return normalized.split("/").pop() ?? normalized;
}

function trimOptionalText(value: string | undefined): string | undefined {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
}
