import type { StagedCacheSteps } from 'staged-cache';

export const CONTENT: string;
export const FOLDER_FILES: Record<string, string>;
export function sha(text: string): string;
export function fileSteps(counter: { builds: number }, delay?: number): StagedCacheSteps;
export function folderSteps(counter: { builds: number }, delay?: number): StagedCacheSteps;
