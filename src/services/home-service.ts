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
		} else if (!settings.keepExistingTabs) {
			// Close all tabs and open fresh
			await this.closeAllLeaves();
			leaf = this.app.workspace.getLeaf(false);
		} else {
			// Open in a new tab or use empty tab
			const emptyLeaf = this.findEmptyLeaf();
			if (emptyLeaf) {
				leaf = emptyLeaf;
			} else {
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
	 * Close all leaves in the main workspace
	 */
	private async closeAllLeaves(): Promise<void> {
		const leaves = [...this.app.workspace.getLeavesOfType('markdown')];
		for (const leaf of leaves) {
			leaf.detach();
		}
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
