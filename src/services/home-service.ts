/**
 * Home Base Service
 * Core logic for opening and managing the home base file
 */

import { App, TFile, WorkspaceLeaf, MarkdownView } from 'obsidian';
import type HomeBasePlugin from '../main';
import { getFileByPath, isMarkdownLike, leafHasFile, isSupportedExtension } from '../utils/file-utils';
import { executeCommand } from '../ui/command-suggest';

/**
 * View types that can be home base files
 */
const LEAF_TYPES = ['markdown', 'canvas', 'bases'];

export class HomeBaseService {
	private app: App;
	private plugin: HomeBasePlugin;

	constructor(plugin: HomeBasePlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
	}

	/**
	 * Open the home base file
	 * @param options Options for opening
	 */
	async openHomeBase(options: {
		replaceActiveLeaf?: boolean;
		runCommand?: boolean;
	} = {}): Promise<boolean> {
		const { replaceActiveLeaf = false, runCommand = true } = options;
		const settings = this.plugin.settings;

		// Check if home base is configured
		if (!settings.homeBasePath) {
			return false;
		}

		// Get the home base file
		const file = getFileByPath(this.app, settings.homeBasePath);
		if (!file) {
			console.debug(`Home Base: File not found: ${settings.homeBasePath}`);
			return false;
		}

		// Check if we should use an existing leaf
		const existingLeaf = this.findExistingHomeBaseLeaf(file);
		
		// If keepExistingTabs is false, close all tabs except the home base
		// This must happen BEFORE we determine which leaf to use, so we don't reuse closed leaves
		if (!settings.keepExistingTabs) {
			await this.closeAllLeavesExcept(existingLeaf);
			// Small additional delay to ensure all detachments are processed
			await new Promise(resolve => setTimeout(resolve, 50));
		}
		
		if (existingLeaf) {
			// Just focus the existing leaf
			this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
			await this.configureView(existingLeaf, file);
			
			if (runCommand) {
				this.runCommandOnOpen();
			}
			return true;
		}

		// Determine how to open
		let leaf: WorkspaceLeaf;
		
		if (replaceActiveLeaf) {
			// Replace the current active leaf
			const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
			if (activeLeaf) {
				leaf = activeLeaf;
			} else {
				leaf = this.app.workspace.getLeaf(false);
			}
		} else {
			// Open in a new tab or use empty tab
			// After closing all leaves, we should create a fresh leaf
			// Check for empty leaf first, but if keepExistingTabs is false, we likely closed everything
			const emptyLeaf = this.findEmptyLeaf();
			if (emptyLeaf && settings.keepExistingTabs) {
				// Only reuse empty leaf if we're keeping existing tabs
				leaf = emptyLeaf;
			} else {
				// Create a new leaf
				leaf = this.app.workspace.getLeaf('tab');
			}
		}

		// Open the file
		await leaf.openFile(file);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		
		// Configure the view
		await this.configureView(leaf, file);

		// Run command if configured
		if (runCommand) {
			this.runCommandOnOpen();
		}

		return true;
	}

	/**
	 * Open home base in an empty leaf (for new tab replacement)
	 */
	async openInLeaf(leaf: WorkspaceLeaf): Promise<boolean> {
		const settings = this.plugin.settings;

		if (!settings.homeBasePath) {
			return false;
		}

		const file = getFileByPath(this.app, settings.homeBasePath);
		if (!file) {
			return false;
		}

		await leaf.openFile(file);
		await this.configureView(leaf, file);
		
		// Run command if configured
		this.runCommandOnOpen();

		return true;
	}

	/**
	 * Configure the view mode for a leaf
	 */
	private async configureView(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
		const settings = this.plugin.settings;

		// Only configure view mode for markdown-like files
		if (!isMarkdownLike(file)) {
			return;
		}

		if (settings.openViewMode === 'default') {
			return;
		}

		const view = leaf.view;
		if (!(view instanceof MarkdownView)) {
			return;
		}

		const state = view.getState();

		switch (settings.openViewMode) {
			case 'preview':
				state.mode = 'preview';
				break;
			case 'source':
				state.mode = 'source';
				state.source = true;
				break;
			case 'live':
				state.mode = 'source';
				state.source = false;
				break;
		}

		await leaf.setViewState({
			type: 'markdown',
			state: state,
		});
	}

	/**
	 * Run the configured command after opening
	 */
	private runCommandOnOpen(): void {
		const commandId = this.plugin.settings.commandOnOpen;
		if (commandId) {
			// Small delay to ensure the view is ready
			setTimeout(() => {
				executeCommand(this.app, commandId);
			}, 100);
		}
	}

	/**
	 * Find an existing leaf that has the home base file open
	 */
	findExistingHomeBaseLeaf(file?: TFile): WorkspaceLeaf | null {
		const homeBasePath = file?.path || this.plugin.settings.homeBasePath;
		if (!homeBasePath) return null;

		const leaves = LEAF_TYPES.flatMap(type => 
			this.app.workspace.getLeavesOfType(type)
		);

		for (const leaf of leaves) {
			if (leafHasFile(leaf, homeBasePath)) {
				return leaf;
			}
		}

		return null;
	}

	/**
	 * Find an empty leaf
	 */
	private findEmptyLeaf(): WorkspaceLeaf | null {
		const leaves = this.app.workspace.getLeavesOfType('empty');
		return leaves[0] || null;
	}

	/**
	 * Close all leaves in the main workspace except the specified one
	 * Simplified approach: iterate all leaves and close those in main workspace
	 */
	private async closeAllLeavesExcept(exceptLeaf: WorkspaceLeaf | null): Promise<void> {
		// Use iterateAllLeaves to get ALL leaves
		const leavesToClose: WorkspaceLeaf[] = [];
		
		this.app.workspace.iterateAllLeaves((leaf) => {
			// Skip the exception leaf
			if (leaf === exceptLeaf) {
				return;
			}
			
			// Try to determine if this is a main workspace leaf
			// Get the view's container element
			const view = leaf.view;
			let container: HTMLElement | null = null;
			
			if (view) {
				const viewAny = view as unknown as { containerEl?: HTMLElement };
				container = viewAny.containerEl || null;
			}
			
			// If no container from view, try leaf's containerEl
			if (!container) {
				const leafAny = leaf as unknown as { containerEl?: HTMLElement };
				container = leafAny.containerEl || null;
			}
			
			if (container) {
				// Check if it's in the main workspace (root, not sidebar)
				const rootWorkspace = container.closest('.workspace-split.mod-vertical.mod-root');
				const leftSidebar = container.closest('.workspace-split.mod-left-split');
				const rightSidebar = container.closest('.workspace-split.mod-right-split');
				
				if (rootWorkspace && !leftSidebar && !rightSidebar) {
					leavesToClose.push(leaf);
				}
			}
		});
		
		// Close all identified leaves
		for (const leaf of leavesToClose) {
			void leaf.detach();
		}
		
		// Wait for detachments to complete
		await new Promise(resolve => setTimeout(resolve, 200));
	}

	/**
	 * Check if the focused tab is the home base
	 */
	isFocusedOnHomeBase(): boolean {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return false;

		const homeBasePath = this.plugin.settings.homeBasePath;
		if (!homeBasePath) return false;

		// Get the home base file for accurate comparison
		const homeBaseFile = getFileByPath(this.app, homeBasePath);
		if (!homeBaseFile) return false;

		return activeFile.path === homeBaseFile.path;
	}

	/**
	 * Check if home base file exists
	 */
	homeBaseExists(): boolean {
		const path = this.plugin.settings.homeBasePath;
		if (!path) return false;
		
		return getFileByPath(this.app, path) !== null;
	}

	/**
	 * Set the active file as home base
	 */
	async setActiveFileAsHomeBase(): Promise<boolean> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return false;

		// Check if the file type is supported
		if (!isSupportedExtension(activeFile.extension.toLowerCase())) {
			return false;
		}

		this.plugin.settings.homeBasePath = activeFile.path;
		await this.plugin.saveSettings();
		return true;
	}

	/**
	 * Check if active file can be set as home base
	 */
	canSetActiveFileAsHomeBase(): boolean {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return false;

		return isSupportedExtension(activeFile.extension.toLowerCase());
	}
}
