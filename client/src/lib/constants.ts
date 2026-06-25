export const PREDEFINED_SEGMENTS = [
  "MARINE",
  "PERFORMANCE",
  "POWDER",
  "PROTECTIVE",
  "REVENDA",
] as const;

export type PredefinedSegment = typeof PREDEFINED_SEGMENTS[number];
