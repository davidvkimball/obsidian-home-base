/**
 * Home Base Plugin Settings
 */

export type ViewMode = 'default' | 'preview' | 'source' | 'live';
export type NewTabMode = 'only-when-empty' | 'always';
export type OpeningMode = 'replace-all' | 'replace-last' | 'retain';

/**
 * Homepage type enum - matches homepage plugin's Kind enum
 */
export enum HomeBaseType {
	File = 'File',
	Workspace = 'Workspace',
	Random = 'Random file',
	RandomFolder = 'Random in folder',
	Graph = 'Graph view',
	None = 'Nothing',
	Journal = 'Journal',
	NewNote = 'New note',
	DailyNote = 'Daily Note',
	WeeklyNote = 'Weekly Note',
	MonthlyNote = 'Monthly Note',
	QuarterlyNote = 'Quarterly Note',
	YearlyNote = 'Yearly Note',
}

export interface HomeBaseSettings {
	// General
	homeBaseType: HomeBaseType;
	homeBaseValue: string; // Type-specific value (file path, workspace name, folder path, etc.)
	openOnStartup: boolean;
	openViewMode: ViewMode;
	openMode: OpeningMode;
	manualOpenMode: OpeningMode;

	// Tab Behavior
	replaceNewTab: boolean;
	newTabMode: NewTabMode;
	openWhenAllTabsClosed: boolean; // Open home base when all tabs are closed (independent of replaceNewTab)
	useDifferentFileForNewTab: boolean; // Use separate new tab settings vs home base
	newTabType: HomeBaseType;
	newTabValue: string;
	newTabSeparateMobile: boolean;
	mobileNewTabType: HomeBaseType;
	mobileNewTabValue: string;

	// UI Features (off by default)
	showStickyHomeIcon: boolean;
	stickyIconName: string | null;
	hideHomeTabHeader: boolean;
	replaceMobileNewTab: boolean;
	
	// Mobile
	separateMobile: boolean;
	mobileHomeBaseType: HomeBaseType;
	mobileHomeBaseValue: string;

	// Automation
	commandOnOpen: string;
	waitForGitSync: boolean;
	gitSyncTimeout: number;
	
	// View behavior
	revertView: boolean;
	autoScroll: boolean;
	hideReleaseNotes: boolean;

	// Legacy - kept in type for migration but removed from defaults
	homeBasePath?: string;
	keepExistingTabs?: boolean;
	mobileHomeBasePath?: string;
}

export const DEFAULT_SETTINGS: HomeBaseSettings = {
	// General
	homeBaseType: HomeBaseType.File,
	homeBaseValue: '',
	openOnStartup: true,
	openViewMode: 'default',
	openMode: 'replace-all',
	manualOpenMode: 'retain',

	// Tab Behavior
	replaceNewTab: false,
	newTabMode: 'only-when-empty', // Default: only replace when no tabs are open
	openWhenAllTabsClosed: true, // Default: open home base when all tabs are closed
	useDifferentFileForNewTab: false,
	newTabType: HomeBaseType.File,
	newTabValue: '',
	newTabSeparateMobile: false,
	mobileNewTabType: HomeBaseType.File,
	mobileNewTabValue: '',

	// UI Features
	showStickyHomeIcon: false,
	stickyIconName: 'home',
	hideHomeTabHeader: false,
	replaceMobileNewTab: false,
	
	// Mobile
	separateMobile: false,
	mobileHomeBaseType: HomeBaseType.File,
	mobileHomeBaseValue: '',

	// Automation
	commandOnOpen: '',
	waitForGitSync: false,
	gitSyncTimeout: 5, // Default 5 seconds
	
	// View behavior
	revertView: false,
	autoScroll: false,
	hideReleaseNotes: false, // OFF by default
};

/**
 * View mode display names for settings dropdown
 */
export const VIEW_MODE_OPTIONS: Record<ViewMode, string> = {
	'default': 'Default',
	'preview': 'Reading view',
	'source': 'Source mode',
	'live': 'Live Preview',
};

/**
 * New tab mode display names for settings dropdown
 */
export const NEW_TAB_MODE_OPTIONS: Record<NewTabMode, string> = {
	'only-when-empty': 'Only when no tabs are open',
	'always': 'Always replace new tabs',
};

/**
 * Opening mode display names for settings dropdown
 */
export const OPENING_MODE_OPTIONS: Record<OpeningMode, string> = {
	'replace-all': 'Replace all open notes',
	'replace-last': 'Replace last note',
	'retain': 'Keep open notes',
};

/**
 * Homepage types that don't require a value input
 */
export const UNCHANGEABLE_TYPES: HomeBaseType[] = [
	HomeBaseType.Random,
	HomeBaseType.Graph,
	HomeBaseType.None,
	HomeBaseType.DailyNote,
	HomeBaseType.WeeklyNote,
	HomeBaseType.MonthlyNote,
	HomeBaseType.QuarterlyNote,
	HomeBaseType.YearlyNote,
];
