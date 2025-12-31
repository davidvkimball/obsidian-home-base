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
			// Initialize new tab service (handles startup)
			this.newTabService.initialize();

			// Update UI features
			this.updateStickyTabIcon();
			this.updateMobileButton();
		});

		// Register layout change handler
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.newTabService.handleLayoutChange();
				this.stickyTabService.updateActiveState();
			})
		);

		// Register file open handler for active state updates
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				this.stickyTabService.updateActiveState();
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
	}

	/**
	 * Update the mobile button based on current settings
	 */
	updateMobileButton(): void {
		this.mobileButtonService.update();
	}
}
