/**
 * Home Base Type Resolution Utilities
 * Resolves home base paths based on type (File, Workspace, Random, etc.)
 */

import { App, TFile, TFolder, moment } from 'obsidian';
import { HomeBaseType } from '../settings';
import type HomeBasePlugin from '../main';
import {
	createDailyNote, getDailyNote, getAllDailyNotes, getDailyNoteSettings,
	createWeeklyNote, getWeeklyNote, getAllWeeklyNotes, getWeeklyNoteSettings,
	createMonthlyNote, getMonthlyNote, getAllMonthlyNotes, getMonthlyNoteSettings,
	createYearlyNote, getYearlyNote, getAllYearlyNotes, getYearlyNoteSettings,
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
	create: (date: moment.Moment) => Promise<TFile>;
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
	[HomeBaseType.NewNote]: null,
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
	
	const date = moment().startOf(info.noun as moment.unitOfTime.StartOf);
	const communityPlugins = (plugin.app as any).plugins?.plugins || {};
	const periodicNotesPlugin = communityPlugins['periodic-notes'];
	const isLegacy = !periodicNotesPlugin || (periodicNotesPlugin.manifest?.version || '0').startsWith('0');
	
	let note: TFile | null = null;
	
	if (isLegacy) {
		// Legacy Periodic Notes or Core Daily Notes (via interface)
		let all = info.getAll();
		note = info.get(date, all);
		
		// If note doesn't exist and wait for git sync is enabled, wait before creating
		if (!note && plugin.settings.waitForGitSync) {
			await delay(plugin.settings.gitSyncTimeout * 1000);
			all = info.getAll();
			note = info.get(date, all);
		}
		
		if (!note) {
			note = await info.create(date);
		}
	} else {
		// v1.0.0+ Periodic Notes API
		periodicNotesPlugin.cache?.initialize?.();
		note = periodicNotesPlugin.getPeriodicNote?.(info.noun, date);
		
		// If note doesn't exist and wait for git sync is enabled, wait before creating
		if (!note && plugin.settings.waitForGitSync) {
			await delay(plugin.settings.gitSyncTimeout * 1000);
			periodicNotesPlugin.cache?.initialize?.();
			note = periodicNotesPlugin.getPeriodicNote?.(info.noun, date);
		}
		
		if (!note) {
			note = await periodicNotesPlugin.createPeriodicNote?.(info.noun, date);
		}
	}
	
	return note ? trimFile(note) : null;
}

/**
 * Get journal note path
 */
async function getJournalNote(journalName: string, plugin: HomeBasePlugin): Promise<string | null> {
	const communityPlugins = (plugin.app as any).plugins?.plugins || {};
	const journals = communityPlugins['journals'];
	if (!journals) return null;
	
	try {
		const journal = journals.getJournal?.(journalName);
		if (!journal) return null;
		
		const origAutoCreate = journal.config?.value?.autoCreate;
		
		// Trigger auto-create (hacky logic from homepage plugin)
		journals.reprocessNotes?.();
		if (journal.config?.value) {
			journal.config.value.autoCreate = true;
		}
		
		await journal.autoCreate?.();
		
		if (journal.config?.value) {
			journal.config.value.autoCreate = origAutoCreate;
		}
		
		const today = moment().locale('custom-journal-locale').startOf('day');
		
		// If note doesn't exist and wait for git sync is enabled, wait
		let note = journal.get?.(today);
		if (!note && plugin.settings.waitForGitSync) {
			await delay(plugin.settings.gitSyncTimeout * 1000);
			journals.reprocessNotes?.();
			note = journal.get?.(today);
		}
		
		if (!note) return null;
		
		const path = journal.getNotePath?.(note);
		return path ? path.replace(/\.md$/, '') : null;
	} catch {
		return null;
	}
}

/**
 * Compute the actual file path based on home base type synchronously
 * Used for comparison and UI updates where async is not possible
 */
export function resolvePathSync(
	type: HomeBaseType,
	value: string,
	app: App
): string | null {
	switch (type) {
		case HomeBaseType.File:
			return value || null;
		
		case HomeBaseType.DailyNote:
		case HomeBaseType.WeeklyNote:
		case HomeBaseType.MonthlyNote:
		case HomeBaseType.YearlyNote: {
			const info = PERIODIC_INFO[type];
			if (info) {
				const date = moment().startOf(info.noun as any);
				const all = info.getAll();
				const note = info.get(date, all);
				return note ? trimFile(note) : null;
			}
			return null;
		}

		default:
			// For Random, Journal, NewNote, etc., we can't reliably resolve synchronously
			// but we might return the value if it's a path
			return (type === HomeBaseType.RandomFolder || type === HomeBaseType.NewNote) ? null : (value || null);
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
		
		case HomeBaseType.NewNote: {
			const fileManager = plugin.app.fileManager as any;
			if (fileManager.createNewFile) {
				const file = await fileManager.createNewFile(plugin.app.vault.getRoot(), value || 'Untitled');
				return file ? trimFile(file) : null;
			}
			return null;
		}
		
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

/**
 * Helper to wait for a specified duration
 */
function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

