import { describe, expect, it } from "vitest";
import {
	MAX_ZOOM,
	MIN_ZOOM,
	panTransform,
	zoomTransform,
} from "../src/views/viewportTransform";

describe("viewport transform helpers", () => {
	it("adds pointer deltas to pan offsets", () => {
		expect(panTransform({ scale: 1, x: 10, y: 20 }, 5, -3)).toEqual({
			scale: 1,
			x: 15,
			y: 17,
		});
	});

	it("bounds zoom scale", () => {
		const zoomedOut = zoomTransform({ scale: MIN_ZOOM, x: 0, y: 0 }, 10000, 50, 50);
		const zoomedIn = zoomTransform({ scale: MAX_ZOOM, x: 0, y: 0 }, -10000, 50, 50);

		expect(zoomedOut.scale).toBe(MIN_ZOOM);
		expect(zoomedIn.scale).toBe(MAX_ZOOM);
	});

	it("keeps the focal point stable while zooming", () => {
		const before = { scale: 1, x: 10, y: 20 };
		const after = zoomTransform(before, -120, 110, 120);
		const worldXBefore = (110 - before.x) / before.scale;
		const worldYBefore = (120 - before.y) / before.scale;
		const worldXAfter = (110 - after.x) / after.scale;
		const worldYAfter = (120 - after.y) / after.scale;

		expect(worldXAfter).toBeCloseTo(worldXBefore);
		expect(worldYAfter).toBeCloseTo(worldYBefore);
	});

	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
		"normalizes invalid current scale %s while zooming",
		(scale) => {
			const after = zoomTransform({ scale, x: 10, y: 20 }, -120, 110, 120);

			expect(Number.isFinite(after.scale)).toBe(true);
			expect(after.scale).toBeGreaterThanOrEqual(MIN_ZOOM);
			expect(after.scale).toBeLessThanOrEqual(MAX_ZOOM);
			expect(Number.isFinite(after.x)).toBe(true);
			expect(Number.isFinite(after.y)).toBe(true);
		},
	);
});
