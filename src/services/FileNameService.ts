export interface SanitizedEntityFileName {
	displayName: string;
	basename: string;
	fileName: string;
}

const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|#^[\]{}]/g;

export function sanitizeEntityFileName(name: string): SanitizedEntityFileName | null {
	const displayName = name.trim().replace(/\s+/g, " ");

	if (!displayName) {
		return null;
	}

	const basename = displayName
		.replace(/\.\./g, " ")
		.replace(UNSAFE_FILENAME_CHARS, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^[. ]+|[. ]+$/g, "");

	if (!basename) {
		return null;
	}

	return {
		displayName,
		basename,
		fileName: `${basename}.md`,
	};
}
