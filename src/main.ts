/**
 * Home Base Plugin
 * Your dedicated home in your vault
 */

import { Notice, Plugin, addIcon } from 'obsidian';
import { DEFAULT_SETTINGS, HomeBaseSettings } from './settings';
import { HomeBaseSettingTab } from './ui/settings-tab';
import { HomeBaseService } from './services/home-service';
import { NewTabService } from './services/new-tab-service';
import { StickyTabService } from './services/sticky-tab-service';
import { MobileButtonService } from './services/mobile-button-service';

/**
 * Custom home icon SVG (Lucide house icon)
 */
const HOME_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;

export default class HomeBasePlugin extends Plugin {
	settings!: HomeBaseSettings;
	
	// Services
	homeService!: HomeBaseService;
	newTabService!: NewTabService;
	stickyTabService!: StickyTabService;
	mobileButtonService!: MobileButtonService;

	async onload(): Promise<void> {
		await this.loadSettings();

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
				// Check if we should skip startup logic (plugin reload or settings modal open)
				if (this.shouldSkipStartupLogic()) {
					console.debug('Home Base: Skipping startup logic (plugin reload or settings modal open)');
					// Still update UI features, just don't run startup logic
					this.updateStickyTabIcon();
					this.updateMobileButton();
					this.stickyTabService.updateTabHeaders();
					return;
				}

				// This is actual app startup - run startup logic
				this.newTabService.initialize();

				// Update UI features
				this.updateStickyTabIcon();
				this.updateMobileButton();
				
				// Update tab headers after layout is ready
				this.stickyTabService.updateTabHeaders();
			}, 100); // Small delay to ensure DOM is ready
		});

		// Register layout change handler
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.newTabService.handleLayoutChange();
				// Delay tab header updates to avoid flickering during tab transitions
				setTimeout(() => {
					this.stickyTabService.updateActiveState();
					this.stickyTabService.updateTabHeaders();
					// Also update icon position in case sidebar state changed
					this.stickyTabService.updateIconPositionForSidebar();
				}, 150);
			})
		);

		// Register file open handler for active state updates
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				// Delay updates to let file open animation complete
				setTimeout(() => {
					this.stickyTabService.updateActiveState();
					this.stickyTabService.updateTabHeaders();
				}, 100);
			})
		);

		// Register active leaf change handler for tab header updates
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				// Delay to let tab switch animation complete
				setTimeout(() => {
					this.stickyTabService.updateTabHeaders();
				}, 100);
			})
		);

		console.debug('Home Base plugin loaded');
	}

	onunload(): void {
		// Clean up services
		this.stickyTabService.remove();
		this.mobileButtonService.remove();

		console.debug('Home Base plugin unloaded');
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
				if (!this.settings.homeBasePath) {
					new Notice('No home base file configured. Set one in settings.');
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
			callback: async () => {
				await this.stickyTabService.closeHomeBase();
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
}
