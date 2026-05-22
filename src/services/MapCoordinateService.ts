import {
	DEFAULT_TRANSFORM,
	MAX_ZOOM,
	MIN_ZOOM,
	type ViewportTransform,
} from "../views/viewportTransform";

export interface Size {
	width: number;
	height: number;
}

export interface NormalizedPoint {
	x: number;
	y: number;
}

export interface ScreenPoint {
	x: number;
	y: number;
}

export function fitImageToViewport(
	imageSize: Size,
	viewportSize: Size,
): ViewportTransform {
	if (!hasPositiveFiniteSize(imageSize) || !hasPositiveFiniteSize(viewportSize)) {
		return { ...DEFAULT_TRANSFORM };
	}

	const scale = clamp(
		Math.min(
			viewportSize.width / imageSize.width,
			viewportSize.height / imageSize.height,
		),
		MIN_ZOOM,
		MAX_ZOOM,
	);

	return {
		scale,
		x: (viewportSize.width - imageSize.width * scale) / 2,
		y: (viewportSize.height - imageSize.height * scale) / 2,
	};
}

export function normalizedToScreenPoint(
	point: NormalizedPoint,
	imageSize: Size,
	transform: ViewportTransform,
): ScreenPoint {
	assertPositiveFiniteSize(imageSize);
	assertPositiveFiniteScale(transform.scale);

	return {
		x: transform.x + point.x * imageSize.width * transform.scale,
		y: transform.y + point.y * imageSize.height * transform.scale,
	};
}

export function screenToNormalizedPoint(
	point: ScreenPoint,
	imageSize: Size,
	transform: ViewportTransform,
): NormalizedPoint | null {
	if (!hasPositiveFiniteSize(imageSize) || !isPositiveFinite(transform.scale)) {
		return null;
	}

	const x = (point.x - transform.x) / transform.scale / imageSize.width;
	const y = (point.y - transform.y) / transform.scale / imageSize.height;

	if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
		return null;
	}

	return { x, y };
}

function hasPositiveFiniteSize(size: Size): boolean {
	return isPositiveFinite(size.width) && isPositiveFinite(size.height);
}

function assertPositiveFiniteSize(size: Size): void {
	if (!hasPositiveFiniteSize(size)) {
		throw new RangeError("Image size must contain positive finite width and height.");
	}
}

function assertPositiveFiniteScale(scale: number): void {
	if (!isPositiveFinite(scale)) {
		throw new RangeError("Transform scale must be a positive finite number.");
	}
}

function isPositiveFinite(value: number): boolean {
	return Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
