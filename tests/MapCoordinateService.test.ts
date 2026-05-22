import { describe, expect, it } from "vitest";
import {
	fitImageToViewport,
	normalizedToScreenPoint,
	screenToNormalizedPoint,
} from "../src/services/MapCoordinateService";
import { DEFAULT_TRANSFORM, MAX_ZOOM, MIN_ZOOM } from "../src/views/viewportTransform";

describe("MapCoordinateService", () => {
	it("uses default transform identity values for reset behavior", () => {
		expect(DEFAULT_TRANSFORM).toEqual({
			scale: 1,
			x: 0,
			y: 0,
		});
	});

	it("fits an image inside a wider viewport and centers it horizontally", () => {
		const transform = fitImageToViewport(
			{ width: 500, height: 500 },
			{ width: 1000, height: 600 },
		);

		expect(transform.scale).toBeCloseTo(1.2);
		expect(transform.x).toBeCloseTo(200);
		expect(transform.y).toBeCloseTo(0);
	});

	it("fits an image inside a taller viewport and centers it vertically", () => {
		const transform = fitImageToViewport(
			{ width: 500, height: 500 },
			{ width: 600, height: 1000 },
		);

		expect(transform.scale).toBeCloseTo(1.2);
		expect(transform.x).toBeCloseTo(0);
		expect(transform.y).toBeCloseTo(200);
	});

	it("clamps fit scale to the maximum zoom", () => {
		const transform = fitImageToViewport(
			{ width: 100, height: 100 },
			{ width: 10000, height: 10000 },
		);

		expect(transform.scale).toBe(MAX_ZOOM);
		expect(transform.x).toBeCloseTo(4700);
		expect(transform.y).toBeCloseTo(4700);
	});

	it("clamps fit scale to the minimum zoom", () => {
		const transform = fitImageToViewport(
			{ width: 10000, height: 10000 },
			{ width: 100, height: 100 },
		);

		expect(transform.scale).toBe(MIN_ZOOM);
		expect(transform.x).toBeCloseTo(-1200);
		expect(transform.y).toBeCloseTo(-1200);
	});

	it("returns the default transform when dimensions are invalid", () => {
		expect(fitImageToViewport(
			{ width: 0, height: 500 },
			{ width: 1000, height: 600 },
		)).toEqual(DEFAULT_TRANSFORM);

		expect(fitImageToViewport(
			{ width: 500, height: 500 },
			{ width: Number.NaN, height: 600 },
		)).toEqual(DEFAULT_TRANSFORM);
	});

	it("converts normalized points to screen points through a transform", () => {
		const point = normalizedToScreenPoint(
			{ x: 0.5, y: 0.25 },
			{ width: 1000, height: 500 },
			{ scale: 2, x: 10, y: 20 },
		);

		expect(point.x).toBeCloseTo(1010);
		expect(point.y).toBeCloseTo(270);
	});

	it("converts screen points back to normalized points", () => {
		const point = screenToNormalizedPoint(
			{ x: 1010, y: 270 },
			{ width: 1000, height: 500 },
			{ scale: 2, x: 10, y: 20 },
		);

		expect(point).toEqual({ x: 0.5, y: 0.25 });
	});

	it("returns null when converting screen points with invalid dimensions or scale", () => {
		expect(screenToNormalizedPoint(
			{ x: 10, y: 10 },
			{ width: 0, height: 500 },
			{ scale: 2, x: 10, y: 20 },
		)).toBeNull();

		expect(screenToNormalizedPoint(
			{ x: 10, y: 10 },
			{ width: 1000, height: Number.NaN },
			{ scale: 2, x: 10, y: 20 },
		)).toBeNull();

		expect(screenToNormalizedPoint(
			{ x: 10, y: 10 },
			{ width: 1000, height: 500 },
			{ scale: 0, x: 10, y: 20 },
		)).toBeNull();

		expect(screenToNormalizedPoint(
			{ x: 10, y: 10 },
			{ width: 1000, height: 500 },
			{ scale: Number.NaN, x: 10, y: 20 },
		)).toBeNull();
	});

	it("returns null for screen points outside the transformed image", () => {
		expect(screenToNormalizedPoint(
			{ x: 9, y: 270 },
			{ width: 1000, height: 500 },
			{ scale: 2, x: 10, y: 20 },
		)).toBeNull();

		expect(screenToNormalizedPoint(
			{ x: 1010, y: 1021 },
			{ width: 1000, height: 500 },
			{ scale: 2, x: 10, y: 20 },
		)).toBeNull();
	});
});
