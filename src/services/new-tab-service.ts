/**
 * New Tab Service
 * Handles startup detection and new tab replacement
 * Inspired by obsidian-homepage and new-tab-default-page
 */

import { App, WorkspaceLeaf, View } from 'obsidian';
import type HomeBasePlugin from '../main';

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
	 * Initialize the service - called when layout is ready
	 */
	initialize(): void {
		// Track all existing leaves
		this.app.workspace.iterateAllLeaves((leaf) => {
			this.existingLeaves.add(leaf);
		});

		// Handle startup
		void this.handleStartup();
	}

	/**
	 * Handle app startup - open home base if needed
	 */
	private async handleStartup(): Promise<void> {
		const settings = this.plugin.settings;

		if (!settings.openOnStartup || !settings.homeBasePath) {
			this.startupCompleted = true;
			this.isStartup = false;
			return;
		}

		// Check if home base is already the focused tab
		if (this.plugin.homeService.isFocusedOnHomeBase()) {
			console.debug('Home Base: Already focused on home base, skipping startup open');
			this.startupCompleted = true;
			this.isStartup = false;
			return;
		}

		// Check for URL params (like obsidian://open links)
		if (await this.hasUrlParams()) {
			console.debug('Home Base: URL params detected, skipping startup open');
			this.startupCompleted = true;
			this.isStartup = false;
			return;
		}

		// Wait a bit for Obsidian to finish restoring the workspace
		// This ensures all tabs are loaded before we try to close them
		await new Promise(resolve => setTimeout(resolve, 300));

		// Open home base
		// If keepExistingTabs is false, we want to close all tabs first
		// So we pass replaceActiveLeaf: false to trigger the closeAllLeaves() logic
		await this.plugin.homeService.openHomeBase({
			replaceActiveLeaf: false,
			runCommand: true,
		});

		this.startupCompleted = true;
		this.isStartup = false;
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
	 */
	private isEmptyTab(leaf: WorkspaceLeaf): boolean {
		if (!leaf.view) return true;
		return leaf.view.getViewType() === 'empty';
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
