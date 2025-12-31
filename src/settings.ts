/**
 * Home Base Plugin Settings
 */

export type ViewMode = 'default' | 'preview' | 'source' | 'live';
export type NewTabMode = 'only-when-empty' | 'always';

export interface HomeBaseSettings {
	// General
	homeBasePath: string;
	openOnStartup: boolean;
	openViewMode: ViewMode;

	// Tab Behavior
	replaceNewTab: boolean;
	newTabMode: NewTabMode;
	keepExistingTabs: boolean;

	// UI Features (off by default)
	showStickyHomeIcon: boolean;
	stickyIconReplaceTab: boolean;
	hideHomeTabHeader: boolean;
	replaceMobileNewTab: boolean;

	// Automation
	commandOnOpen: string;
}

export const DEFAULT_SETTINGS: HomeBaseSettings = {
	// General
	homeBasePath: '',
	openOnStartup: true,
	openViewMode: 'default',

	// Tab Behavior
	replaceNewTab: false,
	newTabMode: 'only-when-empty',
	keepExistingTabs: true,

	// UI Features
	showStickyHomeIcon: false,
	stickyIconReplaceTab: false,
	hideHomeTabHeader: false,
	replaceMobileNewTab: false,

	// Automation
	commandOnOpen: '',
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
