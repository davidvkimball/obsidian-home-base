/**
 * Type definitions for internal Obsidian APIs
 * These are not part of the public API but are needed for plugin functionality
 */

/// <reference types="moment" />

import { TFile } from 'obsidian';

declare module 'obsidian' {
	interface App {
		runOpeningBehavior?: (path: string) => Promise<void>;
		nvOrig_runOpeningBehavior?: (path: string) => Promise<void>;
		internalPlugins?: {
			plugins?: {
				workspaces?: {
					enabled?: boolean;
					instance?: {
						workspaces?: Record<string, unknown>;
						loadWorkspace?: (name: string) => void;
					};
				};
				'daily-notes'?: {
					enabled?: boolean;
					instance?: {
						// eslint-disable-next-line no-undef
						getDailyNotePath?: (date: moment.Moment) => string;
					};
				};
				graph?: {
					enabled?: boolean;
				};
			};
		};
		plugins?: {
			plugins?: {
				'periodic-notes'?: {
					// eslint-disable-next-line no-undef
					getPeriodicNote?: (noun: 'day' | 'week' | 'month' | 'year', date: moment.Moment) => TFile | null;
					// eslint-disable-next-line no-undef
					createPeriodicNote?: (noun: 'day' | 'week' | 'month' | 'year', date: moment.Moment) => Promise<TFile>;
					// eslint-disable-next-line no-undef
					openPeriodicNote?: (noun: 'day' | 'week' | 'month' | 'year', date: moment.Moment, opts?: { inNewSplit?: boolean; calendarSet?: string }) => Promise<void>;
					cache?: {
						initialize?: () => void;
					};
					calendarSetManager?: {
						getActiveSet?: () => Record<string, { enabled?: boolean }>;
						getActiveId?: () => string;
					};
					manifest?: {
						version?: string;
					};
					settings?: Record<string, { enabled?: boolean }>;
				};
				journals?: {
					journals?: Array<{
						name?: string;
						config?: {
							value?: {
								autoCreate?: boolean;
							};
						};
						autoCreate?: () => Promise<void>;
						// eslint-disable-next-line no-undef
						get?: (date: moment.Moment) => TFile | null;
						getNotePath?: (file: TFile) => string;
					}>;
					reprocessNotes?: () => void;
				};
			};
		};
		commands?: {
			executeCommandById?: (id: string) => boolean | Promise<void>;
		};
		workspace?: {
			rightSplit?: {
				updateInfo?: () => void;
			};
		};
	}
}

declare global {
	interface Window {
		OBS_ACT?: {
			action?: string;
			[key: string]: unknown;
		};
		// eslint-disable-next-line no-undef
		moment?: typeof moment;
	}
}

