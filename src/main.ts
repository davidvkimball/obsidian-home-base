/**
 * Home Base Plugin
 * Your dedicated home in your vault
 */

import { Notice, Platform, Plugin, addIcon } from 'obsidian';
import { DEFAULT_SETTINGS, HomeBaseSettings, HomeBaseType } from './settings';
import { HomeBaseSettingTab } from './ui/settings-tab';
import { HomeBaseService } from './services/home-service';
import { NewTabService } from './services/new-tab-service';
import { StickyTabService } from './services/sticky-tab-service';
import { MobileButtonService } from './services/mobile-button-service';
import { migrateLegacySettings } from './migration';

/**
 * Extended App interface for release notes patching
 */
interface AppWithReleaseNotes {
	showReleaseNotes?: () => void;
	nvOrig_showReleaseNotes?: () => void;
}

/**
 * Custom home icon SVG (Lucide house icon)
 */
const HOME_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;

/**
 * Timing constants for UI operations
 * These delays are necessary for Obsidian's internal DOM updates to complete
 */

/** Delay to ensure DOM is ready after layout-ready event (settings modal detection) */
const DOM_READY_DELAY = 100;

/** Delay for tab header updates after layout changes to avoid visual flickering */
const TAB_HEADER_UPDATE_DELAY = 150;

/** Delay for UI updates after file-open to let animations complete */
const FILE_OPEN_ANIMATION_DELAY = 100;

/** Delay for updates after active-leaf-change to let tab switch animations complete */
const TAB_SWITCH_ANIMATION_DELAY = 100;

/** Delay after layout-ready before marking startup as complete (allows everything to settle) */
const STARTUP_COMPLETE_DELAY = 1000;

export default class HomeBasePlugin extends Plugin {
	settings!: HomeBaseSettings;

	// Services
	homeService!: HomeBaseService;
	newTabService!: NewTabService;
	stickyTabService!: StickyTabService;
	mobileButtonService!: MobileButtonService;

	// Release notes tracking
	private newRelease: boolean = false;

	// Track if patched opening behavior already ran
	private openingBehaviorRan: boolean = false;

	// Track if we're currently in startup (to prevent handleOpenWhenEmpty from firing)
	private isStartup: boolean = true;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Migrate legacy settings on first load
		await migrateLegacySettings(this);

		// Patch opening behavior for fast startup (before other initialization)
		this.patchOpeningBehavior();

		// Register custom icon
		addIcon('home-base', HOME_ICON);

		// Initialize services
		this.homeService = new HomeBaseService(this);
		this.newTabService = new NewTabService(this);
		this.stickyTabService = new StickyTabService(this);
		this.mobileButtonService = new MobileButtonService(this);

		// Add ribbon icon
		this.addRibbonIcon('home', 'Open home base', () => {
			void this.homeService.openHomeBase({
				replaceActiveLeaf: false,
				runCommand: true,
			});
		});

		// Register commands
		this.registerCommands();

		// Add settings tab
		this.addSettingTab(new HomeBaseSettingTab(this.app, this));

		// Wait for layout to be ready
		this.app.workspace.onLayoutReady(() => {
			// Use a small delay to ensure DOM is ready (especially for settings modal detection)
			setTimeout(() => {
				// Check if settings modal is open - if so, skip startup logic
				if (this.isSettingsModalOpen()) {
					// Still update UI features, just don't run startup logic
					this.updateStickyTabIcon();
					this.updateMobileButton();
					this.stickyTabService.updateTabHeaders();
					return;
				}

				// Always initialize the new tab service to track existing leaves
				// This is needed for new tab replacement to work
				// But only run startup logic if opening behavior didn't already run
				if (!this.openingBehaviorRan) {
					// Opening behavior didn't run, so initialize normally (includes startup)
					this.newTabService.initialize();
				} else {
					// Opening behavior already ran, but we still need to track existing leaves
					// for new tab replacement to work
					this.newTabService.trackExistingLeaves();
				}

				// Restore ghost leaves from previous session before updating UI
				this.homeService.restoreGhostLeaves();

				// Mark startup as complete after a delay to allow everything to settle
				setTimeout(() => {
					this.isStartup = false;
				}, STARTUP_COMPLETE_DELAY);

				// Update UI features
				this.updateStickyTabIcon();
				this.updateMobileButton();

				// Update tab headers after layout is ready
				this.stickyTabService.updateTabHeaders();
			}, DOM_READY_DELAY);
		});

		// Register layout change handler
		this.registerEvent(
			this.app.workspace.on('layout-change', async () => {
				this.newTabService.handleLayoutChange();
				// Handle revert view on close
				if (this.settings.revertView) {
					await this.homeService.revertView();
				}
				// "Open when empty" feature removed - use "New tab replacement: only when empty" instead
				// They do the same thing since Obsidian auto-creates an empty tab when you close the last one
				// Delay tab header updates to avoid flickering during tab transitions
				setTimeout(() => {
					this.stickyTabService.updateActiveState();
					this.stickyTabService.updateTabHeaders();
					// Also update icon position in case sidebar state changed
					this.stickyTabService.updateIconPositionForSidebar();
				}, TAB_HEADER_UPDATE_DELAY);
			})
		);

		// Register file open handler for active state updates
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				// Delay updates to let file open animation complete
				setTimeout(() => {
					this.stickyTabService.updateActiveState();
					this.stickyTabService.updateTabHeaders();
				}, FILE_OPEN_ANIMATION_DELAY);
			})
		);

		// Register active leaf change handler for tab header updates
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				// Delay to let tab switch animation complete
				setTimeout(() => {
					this.stickyTabService.updateTabHeaders();
				}, TAB_SWITCH_ANIMATION_DELAY);
			})
		);

	}

	onunload(): void {
		// Unpatch release notes
		this.unpatchReleaseNotes();

		// Unpatch opening behavior
		this.unpatchOpeningBehavior();

		// Clean up services
		this.stickyTabService.remove();
		this.mobileButtonService.remove();

	}

	/**
	 * Register plugin commands
	 */
	private registerCommands(): void {
		// Open home base
		this.addCommand({
			id: 'open',
			name: 'Open',
			callback: () => {
				const homeBaseSettings = this.getHomeBaseSettings();
				if (!homeBaseSettings.value && homeBaseSettings.type === HomeBaseType.File) {
					new Notice('No home base configured. Set one in settings.');
					return;
				}
				void this.homeService.openHomeBase({
					replaceActiveLeaf: false,
					runCommand: true,
				});
			},
		});

		// Set current file as home base
		this.addCommand({
			id: 'set-current-file',
			name: 'Set current file as home',
			checkCallback: (checking) => {
				if (!this.homeService.canSetActiveFileAsHomeBase()) {
					return false;
				}
				if (!checking) {
					void this.homeService.setActiveFileAsHomeBase().then((success) => {
						if (success) {
							const activeFile = this.app.workspace.getActiveFile();
							new Notice(`Home base set to "${activeFile?.name}"`);
						}
					});
				}
				return true;
			},
		});

		// Toggle sticky home icon
		this.addCommand({
			id: 'toggle-sticky-icon',
			name: 'Toggle sticky home icon',
			callback: async () => {
				await this.stickyTabService.toggle();
				const state = this.settings.showStickyHomeIcon ? 'enabled' : 'disabled';
				new Notice(`Sticky home icon ${state}`);
			},
		});

		// Close home base
		this.addCommand({
			id: 'close',
			name: 'Close',
			callback: () => {
				this.stickyTabService.closeHomeBase();
			},
		});
	}

	/**
	 * Load plugin settings
	 */
	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<HomeBaseSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}


	/**
	 * Get the active home base settings (mobile or desktop)
	 */
	getHomeBaseSettings(): {
		type: HomeBaseType;
		value: string;
	} {
		if (this.settings.separateMobile && Platform.isMobile) {
			return {
				type: this.settings.mobileHomeBaseType || HomeBaseType.File,
				value: this.settings.mobileHomeBaseValue || '',
			};
		}

		return {
			type: this.settings.homeBaseType || HomeBaseType.File,
			value: this.settings.homeBaseValue || '',
		};
	}

	/**
	 * Get the active new tab settings (mobile or desktop)
	 * Falls back to home base settings if useDifferentFileForNewTab is disabled
	 */
	getNewTabSettings(): {
		type: HomeBaseType;
		value: string;
	} {
		// If not using different file for new tab, fall back to home base settings
		if (!this.settings.useDifferentFileForNewTab) {
			return this.getHomeBaseSettings();
		}

		// Use new tab settings, checking for mobile if separate mobile is enabled
		if (this.settings.newTabSeparateMobile && Platform.isMobile) {
			return {
				type: this.settings.mobileNewTabType || HomeBaseType.File,
				value: this.settings.mobileNewTabValue || '',
			};
		}

		return {
			type: this.settings.newTabType || HomeBaseType.File,
			value: this.settings.newTabValue || '',
		};
	}

	/**
	 * Save plugin settings
	 */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Update the sticky tab icon based on current settings
	 */
	updateStickyTabIcon(): void {
		this.stickyTabService.update();
		// Also update tab headers when sticky icon setting changes
		this.stickyTabService.updateTabHeaders();
	}

	/**
	 * Update the mobile button based on current settings
	 */
	updateMobileButton(): void {
		this.mobileButtonService.update();
	}

	/**
	 * Check if we should skip startup logic (e.g., plugin reload, settings modal open)
	 * This prevents destructive behavior when the plugin is reloaded or settings are open
	 */
	private shouldSkipStartupLogic(): boolean {
		// Check if settings modal is open - never run startup logic if it is
		if (this.isSettingsModalOpen()) {
			return true;
		}

		// Check if this is a plugin reload vs actual app startup
		// On actual startup, Obsidian hasn't restored the workspace yet
		// On plugin reload, files are already open and workspace is restored
		const hasOpenFiles = this.app.workspace.getLeavesOfType('markdown').length > 0 ||
			this.app.workspace.getLeavesOfType('canvas').length > 0 ||
			this.app.workspace.getLeavesOfType('bases').length > 0 ||
			this.app.workspace.getLeavesOfType('empty').length > 0;

		// If files are open, this is likely a plugin reload, not actual startup
		return hasOpenFiles;
	}

	/**
	 * Check if the settings modal is currently open
	 */
	private isSettingsModalOpen(): boolean {
		// Check for settings modal by looking for the modal container
		// Try multiple selectors to be more robust
		const settingsModal = document.querySelector('.modal-container.mod-settings') ||
			document.querySelector('.modal.mod-settings') ||
			document.querySelector('.vertical-tab-content');

		// Also check if any modal is open and contains settings content
		if (!settingsModal) {
			const allModals = document.querySelectorAll('.modal-container');
			for (const modal of Array.from(allModals)) {
				if (modal.querySelector('.vertical-tab-content') ||
					modal.querySelector('.settings-content') ||
					modal.classList.contains('mod-settings')) {
					return true;
				}
			}
		}

		return settingsModal !== null;
	}

	/**
	 * Patch runOpeningBehavior for fast startup (like homepage plugin)
	 */
	private patchOpeningBehavior(): void {
		try {
			// Store original method
			this.app.nvOrig_runOpeningBehavior = this.app.runOpeningBehavior;

			// Patch the method
			this.app.runOpeningBehavior = async (path: string) => {
				const openInitially = (
					this.settings.openOnStartup &&
					!this.hasUrlParams()
				);

				if (openInitially) {
					// Mark that we've run opening behavior
					this.openingBehaviorRan = true;

					// Use fast startup - detach all leaves and open home base
					const mode = this.settings.openMode;
					if (mode === 'replace-all') {
						await this.homeService.detachAllLeaves();
					}

					// Use ghost tab if sticky icon is enabled, otherwise use normal open
					if (this.settings.showStickyHomeIcon) {
						void this.homeService.openHomeBaseInGhostTab({
							runCommand: true,
						});
					} else {
						void this.homeService.openHomeBaseWithMode(mode, true);
					}
				} else {
					// Call original behavior
					if (this.app.nvOrig_runOpeningBehavior) {
						await this.app.nvOrig_runOpeningBehavior(path);
					}
				}

				// Unpatch release notes after opening behavior completes
				this.unpatchReleaseNotes();
			};
		} catch (e) {
			console.warn('[Home Base] Failed to patch opening behavior:', e);
		}
	}

	/**
	 * Unpatch runOpeningBehavior
	 */
	private unpatchOpeningBehavior(): void {

		if (this.app.nvOrig_runOpeningBehavior) {

			this.app.runOpeningBehavior = this.app.nvOrig_runOpeningBehavior;
		}
	}

	/**
	 * Patch showReleaseNotes to track new releases
	 */
	private patchReleaseNotes(): void {
		try {
			const appAny = this.app as unknown as AppWithReleaseNotes;
			appAny.nvOrig_showReleaseNotes = appAny.showReleaseNotes;
			appAny.showReleaseNotes = () => {
				this.newRelease = true;
			};
		} catch (e) {
			console.warn('[Home Base] Failed to patch release notes:', e);
		}
	}

	/**
	 * Unpatch showReleaseNotes
	 */
	private unpatchReleaseNotes(): void {
		const appAny = this.app as unknown as AppWithReleaseNotes;

		if (this.newRelease && !this.settings.hideReleaseNotes) {

			appAny.nvOrig_showReleaseNotes?.();
		}


		if (appAny.nvOrig_showReleaseNotes) {

			appAny.showReleaseNotes = appAny.nvOrig_showReleaseNotes;
		}
	}

	/**
	 * Check if a home base type has its required plugin enabled
	 */
	hasRequiredPlugin(type: HomeBaseType): boolean {
		switch (type) {
			case HomeBaseType.Workspace:

				return this.app.internalPlugins?.plugins?.workspaces?.enabled === true;
			case HomeBaseType.Graph:

				return this.app.internalPlugins?.plugins?.graph?.enabled === true;
			case HomeBaseType.Journal:

				return !!this.app.plugins?.plugins?.['journals'];
			case HomeBaseType.DailyNote:
			case HomeBaseType.WeeklyNote:
			case HomeBaseType.MonthlyNote:
			case HomeBaseType.QuarterlyNote:
			case HomeBaseType.YearlyNote:
				return this.hasRequiredPeriodicity(type);
			default:
				return true;
		}
	}

	/**
	 * Check if periodic notes are available for the given type
	 */
	private hasRequiredPeriodicity(type: HomeBaseType): boolean {
		if (type === HomeBaseType.DailyNote) {
			// Daily notes can come from either core plugin OR periodic notes plugin
			const coreDailyNotes = this.app.internalPlugins?.plugins?.['daily-notes']?.enabled === true;
			if (coreDailyNotes) {
				return true;
			}
			// Check periodic notes plugin for daily note support
			const periodicNotes = this.app.plugins?.plugins?.['periodic-notes'];
			if (periodicNotes) {
				const version = (periodicNotes as { manifest?: { version?: string } })?.manifest?.version || '0';
				const isLegacy = version.startsWith('0');

				if (isLegacy) {
					return (periodicNotes as { settings?: Record<string, { enabled?: boolean }> })?.settings?.['daily']?.enabled === true;
				} else {
					const calendarSet = (periodicNotes as { calendarSetManager?: { getActiveSet?: () => Record<string, { enabled?: boolean }> } })?.calendarSetManager?.getActiveSet?.();
					return calendarSet?.['day']?.enabled === true;
				}
			}
			return false;
		}


		const periodicNotes = this.app.plugins?.plugins?.['periodic-notes'];
		if (!periodicNotes) return false;

		// Check if periodic notes plugin has the required period enabled

		const version = (periodicNotes as { manifest?: { version?: string } })?.manifest?.version || '0';
		const isLegacy = version.startsWith('0');

		if (isLegacy) {
			// Legacy periodic notes
			const periodMap: Partial<Record<HomeBaseType, string>> = {
				[HomeBaseType.WeeklyNote]: 'weekly',
				[HomeBaseType.MonthlyNote]: 'monthly',
				[HomeBaseType.QuarterlyNote]: 'quarterly',
				[HomeBaseType.YearlyNote]: 'yearly',
			};

			const adjective = periodMap[type];
			if (!adjective) return false;

			return (periodicNotes as { settings?: Record<string, { enabled?: boolean }> })?.settings?.[adjective]?.enabled === true;
		} else {
			// New periodic notes
			const nounMap: Partial<Record<HomeBaseType, string>> = {
				[HomeBaseType.WeeklyNote]: 'week',
				[HomeBaseType.MonthlyNote]: 'month',
				[HomeBaseType.QuarterlyNote]: 'quarter',
				[HomeBaseType.YearlyNote]: 'year',
			};

			const noun = nounMap[type];
			if (!noun) return false;

			const calendarSet = (periodicNotes as { calendarSetManager?: { getActiveSet?: () => Record<string, { enabled?: boolean }> } })?.calendarSetManager?.getActiveSet?.();

			return calendarSet?.[noun]?.enabled === true;
		}
	}

	/**
	 * Check if URL params indicate a file/workspace should be opened (skip homepage)
	 */
	private hasUrlParams(): boolean {
		// Check for URL params that indicate a specific file/workspace should be opened
		// This prevents homepage from opening when Obsidian is opened with a specific file
		if (typeof window !== 'undefined' && window.OBS_ACT) {
			const params = Object.keys(window.OBS_ACT);
			const action = window.OBS_ACT.action;
			return (
				action !== undefined &&
				['open', 'advanced-uri'].includes(action) &&
				['file', 'filepath', 'workspace'].some(e => params.includes(e))
			);
		}
		return false;
	}

	// "Open when empty" feature removed - redundant with "New tab replacement: only when empty"
	// Since Obsidian auto-creates an empty tab when you close the last one, they do the same thing
}
