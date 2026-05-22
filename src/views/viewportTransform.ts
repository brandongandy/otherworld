export interface ViewportTransform {
	scale: number;
	x: number;
	y: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 6;
const ZOOM_SENSITIVITY = 0.0015;

export const DEFAULT_TRANSFORM: ViewportTransform = {
	scale: 1,
	x: 0,
	y: 0,
};

export function panTransform(
	transform: ViewportTransform,
	deltaX: number,
	deltaY: number,
): ViewportTransform {
	return {
		...transform,
		x: transform.x + deltaX,
		y: transform.y + deltaY,
	};
}

export function zoomTransform(
	transform: ViewportTransform,
	wheelDeltaY: number,
	focalX: number,
	focalY: number,
): ViewportTransform {
	const currentScale = normalizeScale(transform.scale);
	const nextScale = clamp(
		currentScale * Math.exp(-wheelDeltaY * ZOOM_SENSITIVITY),
		MIN_ZOOM,
		MAX_ZOOM,
	);

	if (nextScale === transform.scale) {
		return transform;
	}

	const ratio = nextScale / currentScale;

	return {
		scale: nextScale,
		x: focalX - (focalX - transform.x) * ratio,
		y: focalY - (focalY - transform.y) * ratio,
	};
}

function normalizeScale(scale: number): number {
	if (!Number.isFinite(scale) || scale <= 0) {
		return DEFAULT_TRANSFORM.scale;
	}

	return clamp(scale, MIN_ZOOM, MAX_ZOOM);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
