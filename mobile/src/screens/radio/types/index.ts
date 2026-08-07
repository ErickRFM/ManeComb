export type AudioPermissionState = 'unknown' | 'granted' | 'denied';
export type AudioFilter = 'all' | 'current' | 'mine';
export type RadioPageIndex = 0 | 1 | 2;

// La fase operativa de Radio vive en la autoridad unica:
// `@/src/features/radio-live/radio-live-types` -> RadioLivePhase.
