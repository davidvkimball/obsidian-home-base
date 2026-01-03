/**
 * New Tab Service
 * Handles startup detection and new tab replacement
 * Inspired by obsidian-homepage and new-tab-default-page
 */

import { App, WorkspaceLeaf, View, TFile } from 'obsidian';
import type HomeBasePlugin from '../main';
import { HomeBaseType } from '../settings';

export class NewTabService {
	private app: App;
	private plugin: HomeBasePlugin;
	private existingLeaves: WeakSet<WorkspaceLeaf> = new WeakSet();
	private isStartup: boolean = true;
	private startupCompleted: boolean = false;

	constructor(plugin: HomeBasePlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
	}

	/**
	 * Track all existing leaves (for new tab detection)
	 * This must be called even when startup is handled elsewhere
	 */
	trackExistingLeaves(): void {
		this.app.workspace.iterateAllLeaves((leaf) => {
			this.existingLeaves.add(leaf);
		});
		// Mark startup as completed so layout change handler works
		this.startupCompleted = true;
		this.isStartup = false;
	}

	/**
	 * Initialize the service - called when layout is ready
	 */
	initialize(): void {
		// Track all existing leaves
		this.trackExistingLeaves();

		// Handle startup
		void this.handleStartup();
	}

	/**
	 * Handle app startup - open home base if needed
	 * Only called on actual app startup, not plugin reloads
	 */
	private 	async handleStartup(): Promise<void> {
		const settings = this.plugin.settings;

		// Check if we should skip (openOnStartup is false, or no home base configured)
		const homeBaseSettings = this.plugin.getHomeBaseSettings();
		if (!settings.openOnStartup || (!homeBaseSettings.value && homeBaseSettings.type === HomeBaseType.File)) {
			this.startupCompleted = true;
			this.isStartup = false;
			return;
		}

		// Check for URL params (like obsidian://open links) - if present, skip everything
		if (await this.hasUrlParams()) {
			this.startupCompleted = true;
			this.isStartup = false;
			return;
		}

		// Wait a bit for Obsidian to finish restoring the workspace
		// This ensures all tabs are loaded before we try to close them
		// Need longer delay to ensure workspace is fully restored
		await new Promise(resolve => setTimeout(resolve, 500));

		// If keepExistingTabs is false, close ALL tabs first, then open home base
		// This should ONLY happen on startup, not when manually opening
		// We close everything first, then open fresh - don't try to find tabs to keep
		// Exception: If hideReleaseNotes is OFF, preserve release notes tab
		if (!settings.keepExistingTabs) {
			// If hideReleaseNotes is OFF, we should preserve release notes tab
			let exceptLeaf: WorkspaceLeaf | null = null;
			if (!settings.hideReleaseNotes) {
				// Try to find release notes tab
				const allLeaves = this.app.workspace.getLeavesOfType('markdown');
				for (const leaf of allLeaves) {
					const view = leaf.view;
					 
					const markdownView = view as unknown as { file?: TFile; containerEl?: HTMLElement };
					if (markdownView.file) {
						const file = markdownView.file;
					// Release notes are typically in config folder or have specific naming
					// Check if it's a release notes tab by looking at the file path
					const configDir = this.app.vault.configDir;
					if (file.path.includes('release') || file.path.includes(configDir)) {
							// Check if it's actually a release notes view
							const container = markdownView.containerEl;
							if (container && container.querySelector('.release-notes')) {
								exceptLeaf = leaf;
								break;
							}
						}
					}
				}
			}
			
			// Close ALL tabs - don't try to keep any, just close everything (except release notes if applicable)
			await this.plugin.homeService.closeAllLeavesExcept(exceptLeaf);
			// Wait longer to ensure all detachments are processed
			await new Promise(resolve => setTimeout(resolve, 200));
		}

		// On startup, use ghost tab if sticky icon is enabled, otherwise use normal openHomeBase
		if (settings.showStickyHomeIcon) {
			await this.plugin.homeService.openHomeBaseInGhostTab({
				runCommand: true,
			});
		} else {
			// Always call openHomeBase - it will open home base if not already open
			await this.plugin.homeService.openHomeBase({
				replaceActiveLeaf: false,
				runCommand: true,
			});
		}

		this.startupCompleted = true;
		this.isStartup = false;
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
	 * Check for URL parameters that indicate Obsidian was opened via a link
	 * Based on obsidian-homepage implementation
	 */
	private async hasUrlParams(): Promise<boolean> {
		// Check for mobile URL params (Capacitor API)
		const windowAny = window as unknown as Record<string, unknown>;
		
		const capacitor = windowAny.Capacitor as { Plugins?: { App?: { getLaunchUrl: () => Promise<{ url?: string } | null> } } } | undefined;
		if (capacitor?.Plugins?.App) {
			try {
				const launchUrl = await capacitor.Plugins.App.getLaunchUrl();
				if (launchUrl?.url) {
					const url = new URL(launchUrl.url);
					const params = Array.from(url.searchParams.keys());
					const action = url.hostname;
					
					if (['open', 'advanced-uri'].includes(action) &&
						['file', 'filepath', 'workspace'].some(e => params.includes(e))) {
						return true;
					}
				}
			} catch {
				// Ignore errors
			}
		}

		// Check for desktop URL params
		const obsAct = windowAny.OBS_ACT as { action?: string } | undefined;
		if (obsAct) {
			const params = Object.keys(obsAct);
			const action = obsAct.action;
			
			if (action && ['open', 'advanced-uri'].includes(action) &&
				['file', 'filepath', 'workspace'].some(e => params.includes(e))) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Handle layout change event - check for new empty tabs
	 * Based on new-tab-default-page implementation
	 */
	handleLayoutChange(): void {
		// Skip if new tab replacement is disabled
		if (!this.plugin.settings.replaceNewTab) {
			return;
		}

		// Skip during startup
		if (this.isStartup || !this.startupCompleted) {
			return;
		}

		// Check all leaves for new empty ones
		this.app.workspace.iterateAllLeaves((leaf) => {
			// Skip if we've already seen this leaf
			if (this.existingLeaves.has(leaf)) {
				return;
			}

			// Mark as seen
			this.existingLeaves.add(leaf);

			// Check if this is an empty tab
			if (!this.isEmptyTab(leaf)) {
				return;
			}

			// Handle based on mode
			if (this.plugin.settings.newTabMode === 'only-when-empty') {
				// Only replace if this is the only tab
				if (!this.isOnlyTab(leaf)) {
					return;
				}
			}

			// Replace the empty tab with home base
			void this.replaceEmptyTab(leaf);
		});
	}

	/**
	 * Check if a leaf is an empty tab
	 * IMPORTANT: Only returns true if the leaf is truly empty (no file opened)
	 * If a file is already opened in the leaf, it's not empty and should NOT be replaced
	 */
	private isEmptyTab(leaf: WorkspaceLeaf): boolean {
		if (!leaf.view) return true;
		
		// Check if view type is empty
		if (leaf.view.getViewType() !== 'empty') {
			return false;
		}
		
		// Double-check: if the view has a state with a file, it's not empty
		// This prevents replacing tabs that were just opened with files from explorer
		const viewState = leaf.getViewState();
		if (viewState && (viewState as { file?: string }).file) {
			return false;
		}
		
		return true;
	}

	/**
	 * Check if this is the only tab in the workspace
	 */
	private isOnlyTab(leaf: WorkspaceLeaf): boolean {
		const leafAny = leaf as unknown as { parentSplit?: { children?: unknown[] } };
		const parent = leafAny.parentSplit;
		if (!parent) return true;
		
		const children = parent.children;
		if (!children) return true;
		
		return children.length === 1;
	}

	/**
	 * Replace an empty tab with the home base
	 */
	private async replaceEmptyTab(leaf: WorkspaceLeaf): Promise<void> {
		// Small delay to handle race conditions with other plugins
		await new Promise(resolve => setTimeout(resolve, 50));

		// Double-check the tab is still empty
		if (!this.isEmptyTab(leaf)) {
			return;
		}

		// Open home base in this leaf
		await this.plugin.homeService.openInLeaf(leaf);
	}

	/**
	 * Force check for empty workspace and open home base
	 */
	async openIfEmpty(): Promise<void> {
		// Check if there's an empty view
		const activeView = this.app.workspace.getActiveViewOfType(View);
		const activeLeaf = activeView?.leaf;

		if (!activeLeaf) return;

		// Check if it's empty and is the only tab
		if (this.isEmptyTab(activeLeaf) && this.isOnlyTab(activeLeaf)) {
			await this.plugin.homeService.openInLeaf(activeLeaf);
		}
	}
}
