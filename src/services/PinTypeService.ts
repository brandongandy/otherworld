export const PIN_TYPES = [
	"location",
	"event",
	"person",
	"faction",
	"item",
] as const;

export type PinType = typeof PIN_TYPES[number];

export function isPinType(value: unknown): value is PinType {
	return typeof value === "string" && PIN_TYPES.includes(value as PinType);
}
