/**
 * Home Base Type Resolution Utilities
 * Resolves home base paths based on type (File, Workspace, Random, etc.)
 */

import { App, TFile, TFolder } from 'obsidian';
import { HomeBaseType } from '../settings';
import type HomeBasePlugin from '../main';
import {
	createDailyNote, getDailyNote, getAllDailyNotes,
	createWeeklyNote, getWeeklyNote, getAllWeeklyNotes,
	createMonthlyNote, getMonthlyNote, getAllMonthlyNotes,
	createYearlyNote, getYearlyNote, getAllYearlyNotes,
} from 'obsidian-daily-notes-interface';

/**
 * Get a random file from the vault
 * @param app The Obsidian app instance
 * @param root Optional folder path OR filename pattern (e.g., "index.md" to find all files named index.md)
 */
function randomFile(app: App, root?: string): TFile | null {
	let files: TFile[] = [];
	
	if (root) {
		// First try as a folder path
		const resolvedRoot = app.vault.getFolderByPath(root);
		if (resolvedRoot) {
			// It's a folder - get all files in it
			files = getFilesInFolder(resolvedRoot);
		} else {
			// Not a folder - treat as filename pattern (e.g., "index.md")
			// Search for all files matching this name in the vault
			const allFiles = app.vault.getFiles();
			const pattern = root.toLowerCase();
			files = allFiles.filter((f: TFile) => {
				const fileName = f.name.toLowerCase();
				return fileName === pattern || fileName === pattern.replace(/\.md$/, '');
			});
		}
	} else {
		// No root specified - get all files
		files = app.vault.getFiles();
	}

	// Filter to supported file types
	files = files.filter((f: TFile) => ['md', 'canvas', 'base'].includes(f.extension));
	
	if (files.length) {
		const index = Math.floor(Math.random() * files.length);
		return files[index] || null;
	}

	return null;
}

/**
 * Get all files in a folder recursively
 */
function getFilesInFolder(folder: TFolder): TFile[] {
	let files: TFile[] = [];
	
	for (const item of folder.children) {
		if (item instanceof TFile) {
			files.push(item);
		} else if (item instanceof TFolder) {
			files.push(...getFilesInFolder(item));
		}
	}
	
	return files;
}

/**
 * Trim file extension for .md files (like homepage plugin)
 */
export function trimFile(file: TFile): string {
	if (!file) return '';
	return file.extension === 'md' ? file.path.slice(0, -3) : file.path;
}


/**
 * Periodic note info (like homepage plugin)
 */
interface PeriodicInfo {
	noun: string;
	adjective: string;
	// eslint-disable-next-line no-undef
	create: (date: moment.Moment) => Promise<TFile>;
	// eslint-disable-next-line no-undef
	get: (date: moment.Moment, all: Record<string, TFile>) => TFile;
	getAll: () => Record<string, TFile>;
}

const PERIODIC_INFO: Record<HomeBaseType, PeriodicInfo | null> = {
	[HomeBaseType.DailyNote]: {
		noun: 'day',
		adjective: 'daily',
		create: createDailyNote,
		get: getDailyNote,
		getAll: getAllDailyNotes,
	},
	[HomeBaseType.WeeklyNote]: {
		noun: 'week',
		adjective: 'weekly',
		create: createWeeklyNote,
		get: getWeeklyNote,
		getAll: getAllWeeklyNotes,
	},
	[HomeBaseType.MonthlyNote]: {
		noun: 'month',
		adjective: 'monthly',
		create: createMonthlyNote,
		get: getMonthlyNote,
		getAll: getAllMonthlyNotes,
	},
	[HomeBaseType.YearlyNote]: {
		noun: 'year',
		adjective: 'yearly',
		create: createYearlyNote,
		get: getYearlyNote,
		getAll: getAllYearlyNotes,
	},
	[HomeBaseType.File]: null,
	[HomeBaseType.Random]: null,
	[HomeBaseType.RandomFolder]: null,
	[HomeBaseType.Workspace]: null,
	[HomeBaseType.Graph]: null,
	[HomeBaseType.None]: null,
	[HomeBaseType.Journal]: null,
};

/**
 * Get periodic note path (Daily, Weekly, Monthly, Yearly)
 * Based on homepage plugin implementation
 */
async function getPeriodicNote(kind: HomeBaseType, plugin: HomeBasePlugin): Promise<string | null> {
	if (!window.moment) {
		return null;
	}
	
	const info = PERIODIC_INFO[kind];
	if (!info) {
		return null;
	}
	
	// Get the current date for the period (like homepage plugin)
	// eslint-disable-next-line no-undef
	const date = window.moment().startOf(info.noun as moment.unitOfTime.StartOf);
	
	// For daily notes, try core daily notes plugin first (like homepage plugin)
	if (kind === HomeBaseType.DailyNote && plugin.app.internalPlugins?.plugins?.['daily-notes']?.enabled) {
		const dailyNotes = plugin.app.internalPlugins.plugins['daily-notes'].instance;
		if (dailyNotes?.getDailyNotePath) {
			const today = window.moment();
			const path = dailyNotes.getDailyNotePath(today);
			if (path) {
				return path.replace(/\.md$/, '');
			}
		}
	}
	
	// Use periodic notes plugin (like homepage plugin)
	const periodicNotesPlugin = plugin.app.plugins?.plugins?.['periodic-notes'] as {
		// eslint-disable-next-line no-undef
		getPeriodicNote?: (noun: 'day' | 'week' | 'month' | 'year', date: moment.Moment) => TFile | null;
		// eslint-disable-next-line no-undef
		createPeriodicNote?: (noun: 'day' | 'week' | 'month' | 'year', date: moment.Moment) => Promise<TFile>;
		cache?: {
			initialize?: () => void;
		};
		manifest?: {
			version?: string;
		};
	} | undefined;
	
	if (!periodicNotesPlugin) {
		return null;
	}
	
	try {
		// Check if legacy periodic notes (version starts with "0") - exactly like homepage plugin
		const isLegacy = (periodicNotesPlugin.manifest?.version || '0').startsWith('0');
		
		let note: TFile | null = null;
		
		if (isLegacy) {
			// Legacy periodic notes - use obsidian-daily-notes-interface (exactly like homepage plugin)
			const all = info.getAll();
			
			if (!Object.keys(all).length) {
				note = await info.create(date);
			} else {
				note = info.get(date, all) || await info.create(date);
			}
			
			if (!note) {
				note = info.get(date, all);
			}
		} else {
			// New periodic notes - exactly like homepage plugin
			if (periodicNotesPlugin.cache?.initialize) {
				periodicNotesPlugin.cache.initialize();
			}
			
			note = (
				periodicNotesPlugin.getPeriodicNote?.(info.noun as 'day' | 'week' | 'month' | 'year', date) ||
				await periodicNotesPlugin.createPeriodicNote?.(info.noun as 'day' | 'week' | 'month' | 'year', date)
			) || null;
		}
		
		if (note) {
			return trimFile(note);
		}
		
		return null;
	} catch {
		return null;
	}
}

/**
 * Get journal note path
 */
async function getJournalNote(journalName: string, plugin: HomeBasePlugin): Promise<string | null> {
	 
	const journals = plugin.app.plugins?.plugins?.['journals'];
	if (!journals) return null;
	
	try {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		const journal = journals.journals?.find((j: any) => j.name === journalName);
		if (!journal) return null;
		
		// Trigger auto-create if needed
		 
		journals.reprocessNotes?.();
		 
		const origAutoCreate = journal.config?.value?.autoCreate;
		 
		if (journal.config?.value) {
			 
			journal.config.value.autoCreate = true;
		}
		 
		await journal.autoCreate?.();
		 
		if (journal.config?.value) {
			 
			journal.config.value.autoCreate = origAutoCreate;
		}
		
		if (!window.moment) return null;
		 
		const today = window.moment().locale('custom-journal-locale').startOf('day');
		 
		const note = journal.get?.(today);
		if (!note) return null;
		
		 
		const path = journal.getNotePath?.(note);
		 
		return path ? path.replace(/\.md$/, '') : null;
	} catch {
		return null;
	}
}

/**
 * Compute the actual file path based on home base type
 */
export async function computeHomeBasePath(
	type: HomeBaseType,
	value: string,
	plugin: HomeBasePlugin
): Promise<string | null> {
	switch (type) {
		case HomeBaseType.File:
			return value || null;
		
		case HomeBaseType.Random: {
			const file = randomFile(plugin.app);
			return file ? trimFile(file) : null;
		}
		
		case HomeBaseType.RandomFolder: {
			const file = randomFile(plugin.app, value);
			return file ? trimFile(file) : null;
		}
		
		case HomeBaseType.DailyNote:
		case HomeBaseType.WeeklyNote:
		case HomeBaseType.MonthlyNote:
		case HomeBaseType.YearlyNote:
			return await getPeriodicNote(type, plugin);
		
		case HomeBaseType.Journal:
			return await getJournalNote(value, plugin);
		
		case HomeBaseType.Workspace:
		case HomeBaseType.Graph:
		case HomeBaseType.None:
			// These don't resolve to a file path
			return null;
		
		default:
			return value || null;
	}
}

/**
 * Check if a home base type requires a file to be opened
 */
export function requiresFile(type: HomeBaseType): boolean {
	return type !== HomeBaseType.Workspace && 
	       type !== HomeBaseType.Graph && 
	       type !== HomeBaseType.None;
}

