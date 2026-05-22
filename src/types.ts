import type { TFile, TFolder } from "obsidian";
import type { PinType } from "./services/PinTypeService";

export const OTHERWORLD_MAP_VIEW_TYPE = "otherworld-map-view";

export const SUPPORTED_IMAGE_EXTENSIONS = [
	"png",
	"jpg",
	"jpeg",
	"webp",
	"gif",
] as const;

export type SupportedImageExtension = typeof SUPPORTED_IMAGE_EXTENSIONS[number];

export interface MapPin {
	id: string;
	name: string;
	link: string;
	entityPath: string;
	type?: PinType | string;
	subtype?: string;
	parentLocation?: string;
	nation?: string;
	region?: string;
	x: number;
	y: number;
}

export interface MapMetadata {
	pins: MapPin[];
}

export interface ResolvedMap {
	folder: TFolder;
	folderPath: string;
	name: string;
	metadataFile: TFile;
	imageFile: TFile;
}
