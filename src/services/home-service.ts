/**
 * Home Base Service
 * Core logic for opening and managing the home base file
 */

import { App, TFile, WorkspaceLeaf, MarkdownView, Platform, View as OView } from 'obsidian';
import type HomeBasePlugin from '../main';
import { HomeBaseType, OpeningMode } from '../settings';
import { getFileByPath, isMarkdownLike, leafHasFile, isSupportedExtension } from '../utils/file-utils';
import { executeCommand } from '../ui/command-suggest';
import { computeHomeBasePath, trimFile } from '../utils/homebase-resolver';

/**
 * View types that can be home base files
 */
const LEAF_TYPES = ['markdown', 'canvas', 'bases'];

/**
 * Helper to check if two file paths are equal (case-insensitive, ignoring extension)
 */
function equalsCaseless(path1: string, path2: string): boolean {
	const normalize = (p: string) => p.toLowerCase().replace(/\.md$/, '');
	return normalize(path1) === normalize(path2);
}

export class HomeBaseService {
	private app: App;
	private plugin: HomeBasePlugin;

	constructor(plugin: HomeBasePlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
	}

	/**
	 * Open home base with a specific mode (for startup/manual opens)
	 */
	async openHomeBaseWithMode(mode: OpeningMode, runCommand: boolean = true): Promise<boolean> {
		const homeBaseSettings = this.plugin.getHomeBaseSettings();
		
		// Handle non-file types (Workspace, Graph, None)
		if (homeBaseSettings.type === HomeBaseType.Workspace) {
			return this.openWorkspace(homeBaseSettings.value);
		}
		if (homeBaseSettings.type === HomeBaseType.Graph) {
			// Graph view: just open it (no ghost tab support due to unreliable detection)
			return this.openGraph();
		}
		if (homeBaseSettings.type === HomeBaseType.None) {
			// Just run command, don't open anything
			if (runCommand) {
				this.runCommandOnOpen();
			}
			return true;
		}

		// Resolve the actual file path based on type
		const resolvedPath = await computeHomeBasePath(
			homeBaseSettings.type,
			homeBaseSettings.value,
			this.plugin
		);
		
		if (!resolvedPath) {
			return false;
		}

		// Get the file - use metadataCache for better path resolution (like homepage plugin)
		let file = this.app.metadataCache.getFirstLinkpathDest(resolvedPath, '/');
		
		// If not found and auto-create is not supported for this type, return
		// For now, we'll try getFileByPath as fallback
		if (!file) {
			file = getFileByPath(this.app, resolvedPath);
		}
		
		if (!file) {
			// Try to create if it's a markdown file and path doesn't have extension
			const untrimmedPath = resolvedPath.endsWith('.md') ? resolvedPath : `${resolvedPath}.md`;
			file = getFileByPath(this.app, untrimmedPath);
			
			if (!file && homeBaseSettings.type === HomeBaseType.File) {
				// Could create file here if autoCreate setting exists, but for now just return
				return false;
			}
		}
		
		if (!file) {
			return false;
		}

		// Handle opening mode
		if (mode === 'replace-all') {
			await this.detachAllLeaves();
		} else if (mode === 'replace-last') {
			// Replace the active leaf (close it and open home base in its place)
			const activeLeaf = this.app.workspace.getActiveViewOfType(OView)?.leaf;
			if (activeLeaf) {
				const viewState = activeLeaf.getViewState();
				// Only close if not pinned
				if (viewState.pinned !== true) {
					void activeLeaf.detach();
					// Wait a bit for detachment
					await new Promise(resolve => setTimeout(resolve, 100));
				}
			}
		}

		// Check for existing leaf (but exclude ghost tab for manual opens)
		const existingLeaf = this.findExistingHomeBaseLeaf(file);
		if (existingLeaf && mode !== 'replace-all') {
			// For replace-last, we still want to reuse existing if found (after closing active)
			const viewState = existingLeaf.getViewState();
			if (viewState.pinned === true && this.plugin.settings.showStickyHomeIcon) {
				// Don't use ghost tab for manual opens - will create new tab below
			} else {
				this.app.workspace.setActiveLeaf(existingLeaf);
				await this.configureView(existingLeaf, file);
				if (runCommand) {
					this.runCommandOnOpen();
				}
				return true;
			}
		}

		// Open in new leaf
		const newLeaf = mode === 'retain' 
			? this.app.workspace.getLeaf('tab')
			: this.app.workspace.getLeaf(false);
		
		if (!newLeaf) {
			return false;
		}
		await newLeaf.openFile(file);
		this.app.workspace.setActiveLeaf(newLeaf);
		await this.configureView(newLeaf, file);

		if (runCommand) {
			this.runCommandOnOpen();
		}

		return true;
	}

	/**
	 * Open workspace
	 */
	private async openWorkspace(workspaceName: string): Promise<boolean> {
		 
		const workspacePlugin = this.app.internalPlugins?.plugins?.workspaces;
		 
		if (!workspacePlugin?.enabled || !workspacePlugin.instance?.loadWorkspace) {
			return false;
		}
		 
		workspacePlugin.instance.loadWorkspace(workspaceName);
		await new Promise(resolve => setTimeout(resolve, 100));
		return true;
	}

	/**
	 * Open graph view
	 */
	async openGraph(): Promise<boolean> {
		 
		await this.app.commands?.executeCommandById?.('graph:open');
		return true;
	}

	/**
	 * Open graph view in ghost tab
	 * DEPRECATED: Graph view ghost tab detection is unreliable, so this is no longer used
	 * Graph views now just open normally like random files
	 */
	private async openGraphInGhostTab(runCommand: boolean): Promise<boolean> {
		// Check if settings modal is open
		if (this.isSettingsModalOpen()) {
			return false;
		}

		// Check if ghost tab already exists (pinned graph view)
		// Use the same approach as file-based tabs: find it each time
		// Try getLeavesOfType first, then iterateAllLeaves as fallback
		let graphLeaves = this.app.workspace.getLeavesOfType('graph');
		
		// If getLeavesOfType doesn't work (returns 0), use iterateAllLeaves
		if (graphLeaves.length === 0) {
			graphLeaves = [];
			this.app.workspace.iterateAllLeaves((leaf) => {
				try {
					const viewState = leaf.getViewState();
					if (viewState.type === 'graph') {
						graphLeaves.push(leaf);
					}
				} catch {
					// Leaf might be detached, skip it
				}
			});
		}
		
		
		// If there's exactly one graph view, use it as the ghost tab
		// (since we should only have one ghost tab at a time)
		let ghostTab: WorkspaceLeaf | null = null;
		
		if (graphLeaves.length === 1) {
			// Only one graph view exists - this is our ghost tab
			ghostTab = graphLeaves[0] || null;
		} else if (graphLeaves.length > 1) {
			// Multiple graph views - find the pinned one
			for (const leaf of graphLeaves) {
				if (!leaf) continue;
				try {
					const viewState = leaf.getViewState();
					if (viewState.pinned === true) {
						ghostTab = leaf;
						break;
					}
				} catch {
					// Leaf might be detached, skip it
					continue;
				}
			}
			
			// If no pinned one found, use the first one (shouldn't happen, but fallback)
			if (!ghostTab && graphLeaves[0]) {
				ghostTab = graphLeaves[0] || null;
			}
		}
		
		if (ghostTab) {
			// Ghost tab exists - close ALL other graph views (pinned or not), then focus ghost tab
			// Find all graph leaves again to get the current list
			const allGraphLeavesForCleanup: WorkspaceLeaf[] = [];
			this.app.workspace.iterateAllLeaves((leaf) => {
				const viewState = leaf.getViewState();
				if (viewState.type === 'graph') {
					allGraphLeavesForCleanup.push(leaf);
				}
			});
			const otherGraphLeaves = allGraphLeavesForCleanup.filter(leaf => leaf !== ghostTab);
			
			for (const leaf of otherGraphLeaves) {
				void leaf.detach();
			}
			
			// Wait for detachments to complete
			await new Promise(resolve => setTimeout(resolve, 150));
			
			// Double-check - make sure no other graph views exist
			// Use iterateAllLeaves instead of getLeavesOfType for graph views
			const remainingGraphLeaves: WorkspaceLeaf[] = [];
			this.app.workspace.iterateAllLeaves((leaf) => {
				const viewState = leaf.getViewState();
				if (viewState.type === 'graph') {
					remainingGraphLeaves.push(leaf);
				}
			});
			if (remainingGraphLeaves.length > 1) {
				// Still have duplicates, close all except ghost tab
				for (const leaf of remainingGraphLeaves) {
					if (leaf !== ghostTab) {
						void leaf.detach();
					}
				}
				await new Promise(resolve => setTimeout(resolve, 100));
			}
			
			const shouldFocus = !this.isSettingsModalOpen();
			this.app.workspace.setActiveLeaf(ghostTab, { focus: shouldFocus });
			
			if (runCommand) {
				this.runCommandOnOpen();
			}
			return true;
		}

		// No ghost tab exists - close ALL existing graph views first
		// Find all graph leaves
		const allExistingGraphLeaves: WorkspaceLeaf[] = [];
		this.app.workspace.iterateAllLeaves((leaf) => {
			const viewState = leaf.getViewState();
			if (viewState.type === 'graph') {
				allExistingGraphLeaves.push(leaf);
			}
		});
		for (const leaf of allExistingGraphLeaves) {
			void leaf.detach();
		}
		
		// Wait for detachments to complete
		await new Promise(resolve => setTimeout(resolve, 100));

		// Check if there's already a graph view (might have been opened by another action)
		// Use iterateAllLeaves instead of getLeavesOfType for graph views (getLeavesOfType doesn't work for graph)
		let existingGraphLeaves: WorkspaceLeaf[] = [];
		this.app.workspace.iterateAllLeaves((leaf) => {
			const viewState = leaf.getViewState();
			if (viewState.type === 'graph') {
				existingGraphLeaves.push(leaf);
			}
		});
		
		let newGhostTab: WorkspaceLeaf | null = null;
		
		if (existingGraphLeaves.length > 0) {
			// Use the first existing graph view
			newGhostTab = existingGraphLeaves[0] || null;
		} else {
			// No existing graph view, open a new one
			
			// Open graph view in a new leaf directly instead of using the command
			// The command might close existing views
			const newLeaf = this.app.workspace.getLeaf('tab');
			if (newLeaf) {
				await newLeaf.setViewState({
					type: 'graph',
					state: {},
				});
				
				// Wait for graph to initialize
				await new Promise(resolve => setTimeout(resolve, 200));
				
				newGhostTab = newLeaf;
			} else {
				// Fallback to command if we can't create leaf
				await this.openGraph();
				await new Promise(resolve => setTimeout(resolve, 300));
				
				existingGraphLeaves = [];
				this.app.workspace.iterateAllLeaves((leaf) => {
					const viewState = leaf.getViewState();
					if (viewState.type === 'graph') {
						existingGraphLeaves.push(leaf);
					}
				});
				
				if (existingGraphLeaves.length > 0) {
					newGhostTab = existingGraphLeaves[0] || null;
				}
			}
		}
		
		if (newGhostTab) {
			newGhostTab.setPinned(true);
			
			// Close any other graph views that might have been created
			// Use iterateAllLeaves to find all graph views
			const allGraphLeaves: WorkspaceLeaf[] = [];
			this.app.workspace.iterateAllLeaves((leaf) => {
				const viewState = leaf.getViewState();
				if (viewState.type === 'graph') {
					allGraphLeaves.push(leaf);
				}
			});
			
			for (const leaf of allGraphLeaves) {
				if (leaf !== newGhostTab) {
					void leaf.detach();
				}
			}
			
			// Wait for cleanup
			await new Promise(resolve => setTimeout(resolve, 100));
			
			const shouldFocus = !this.isSettingsModalOpen();
			this.app.workspace.setActiveLeaf(newGhostTab, { focus: shouldFocus });
			
			if (runCommand) {
				this.runCommandOnOpen();
			}
			return true;
		}

		return false;
	}

	/**
	 * Open the home base file
	 * @param options Options for opening
	 */
	async openHomeBase(options: {
		replaceActiveLeaf?: boolean;
		runCommand?: boolean;
	} = {}): Promise<boolean> {
		const { runCommand = true } = options;
		const mode = this.plugin.settings.manualOpenMode;
		
		
		// Use the new method with manual mode
		return this.openHomeBaseWithMode(mode, runCommand);
	}

	/**
	 * Open home base in an empty leaf (for new tab replacement)
	 */
	async openInLeaf(leaf: WorkspaceLeaf): Promise<boolean> {
		const homeBaseSettings = this.plugin.getHomeBaseSettings();
		

		// Handle non-file types
		if (homeBaseSettings.type === HomeBaseType.Workspace) {
			await this.openWorkspace(homeBaseSettings.value);
			return true;
		}
		if (homeBaseSettings.type === HomeBaseType.Graph) {
			await this.openGraph();
			return true;
		}
		if (homeBaseSettings.type === HomeBaseType.None) {
			this.runCommandOnOpen();
			return true;
		}

		// Resolve the actual file path based on type
		const resolvedPath = await computeHomeBasePath(
			homeBaseSettings.type,
			homeBaseSettings.value,
			this.plugin
		);
		
		if (!resolvedPath) {
			return false;
		}

		// Get the file - use metadataCache for better path resolution (like homepage plugin)
		// This is especially important for periodic notes which may have been just created
		let file = this.app.metadataCache.getFirstLinkpathDest(resolvedPath, '/');
		
		// If not found, try getFileByPath as fallback
		if (!file) {
			file = getFileByPath(this.app, resolvedPath);
		}
		
		// For periodic notes, the path might be trimmed (no extension)
		// Try with .md extension if still not found
		if (!file && !resolvedPath.endsWith('.md') && !resolvedPath.endsWith('.canvas') && !resolvedPath.endsWith('.base')) {
			const untrimmedPath = `${resolvedPath}.md`;
			file = getFileByPath(this.app, untrimmedPath);
		}
		
		if (!file) {
			return false;
		}

		// If sticky icon is enabled AND this is a truly empty tab (not a file opened from explorer),
		// check if there's a ghost tab and merge with it.
		// This ensures that when you close the last tab and Obsidian creates a new empty one,
		// it merges with the ghost tab instead of creating a duplicate.
		// BUT: If the user manually opened a file from explorer, we should NOT merge - let them have their tab.
		const isTrulyEmpty = !leaf.view || leaf.view.getViewType() === 'empty';
		
		if (this.plugin.settings.showStickyHomeIcon && isTrulyEmpty) {
			// Random types and periodic notes: don't pin, but can still merge
			const isRandom = homeBaseSettings.type === HomeBaseType.Random || 
			                 homeBaseSettings.type === HomeBaseType.RandomFolder ||
			                 homeBaseSettings.type === HomeBaseType.DailyNote ||
			                 homeBaseSettings.type === HomeBaseType.WeeklyNote ||
			                 homeBaseSettings.type === HomeBaseType.MonthlyNote ||
			                 homeBaseSettings.type === HomeBaseType.YearlyNote;
			const ghostTab = this.findGhostTab(file, isRandom);
			
			if (ghostTab) {
				// Close the new empty leaf since we're merging with ghost tab
				void leaf.detach();
				
				// Focus the ghost tab and configure it
				this.app.workspace.setActiveLeaf(ghostTab);
				await this.configureView(ghostTab, file);
				this.runCommandOnOpen();
				return true;
			}
			
			// No ghost tab found, but sticky icon is enabled - this tab should become the ghost tab
			// Pin it so it's recognized as the ghost tab
			if (!isRandom) {
				leaf.setPinned(true);
			}
		}
		await leaf.openFile(file);
		await this.configureView(leaf, file);
		
		// Run command if configured
		this.runCommandOnOpen();

		return true;
	}

	/**
	 * Last view reference for revertView functionality
	 */
	private lastView: WeakRef<MarkdownView> | undefined;

	/**
	 * Configure the view mode for a leaf
	 */
	private async configureView(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
		const settings = this.plugin.settings;
		const view = leaf.view;

		// Only configure view mode for markdown-like files
		if (!isMarkdownLike(file) || !(view instanceof MarkdownView)) {
			return;
		}

		const state = view.getState();

		// Track view for revertView if enabled
		if (settings.revertView) {
			this.lastView = new WeakRef(view);
		}

		// Auto-scroll to bottom if enabled
		if (settings.autoScroll) {
			const count = view.editor.lineCount();
			
			if (state.mode === 'preview') {
				view.previewMode.applyScroll(count - 4);
			} else {
				view.editor.setCursor(count);
				view.editor.focus();
			}
		}

		// Set view mode
		if (settings.openViewMode !== 'default') {
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
	}

	/**
	 * Revert view to default when navigating away from home base
	 */
	async revertView(): Promise<void> {
		const settings = this.plugin.settings;
		if (!settings.revertView || !this.lastView || settings.openViewMode === 'default') {
			return;
		}

		const view = this.lastView.deref();
		if (!view) {
			this.lastView = undefined;
			return;
		}

		const homeBaseSettings = this.plugin.getHomeBaseSettings();
		const resolvedPath = await computeHomeBasePath(
			homeBaseSettings.type,
			homeBaseSettings.value,
			this.plugin
		);

		if (!resolvedPath) {
			this.lastView = undefined;
			return;
		}

		// Check if we're still on the home base file
		const currentFile = view.file;
		if (currentFile && equalsCaseless(trimFile(currentFile), resolvedPath)) {
			return; // Still on home base, don't revert
		}

		// Revert to default view
		const state = view.getState();
		 
		const config = (this.app.vault as unknown as { config?: { defaultViewMode?: string; livePreview?: boolean } }).config;
		const mode = config?.defaultViewMode || 'source';
		const source = config?.livePreview !== undefined ? !config.livePreview : false;

		if (
			view.leaf.getViewState().type === 'markdown' &&
			(mode !== state.mode || source !== state.source)
		) {
			state.mode = mode;
			state.source = source;
			await view.leaf.setViewState({ type: 'markdown', state, active: true });
		}

		this.lastView = undefined;
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
		if (!file) return null;
		const homeBasePath = file.path;

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
	 * Find the ghost tab (the one opened via sticky icon)
	 * Ghost tab is identified by being pinned and having the home base file
	 * Only searches in the current window (getLeavesOfType is window-scoped)
	 * 
	 * Note: If the ghost tab is moved to another window, this will return null,
	 * and a new ghost tab will be created in the current window when needed.
	 * This is the desired behavior - each window can have its own ghost tab.
	 * 
	 * For random types, we don't look for pinned tabs (they're not pinned).
	 */
	findGhostTab(file?: TFile, isRandom: boolean = false): WorkspaceLeaf | null {
		if (!file) {
			return null;
		}
		const homeBasePath = file.path;

		// getLeavesOfType only returns leaves in the current window
		const leaves = LEAF_TYPES.flatMap(type => 
			this.app.workspace.getLeavesOfType(type)
		);

		for (const leaf of leaves) {
			if (leafHasFile(leaf, homeBasePath)) {
				const viewState = leaf.getViewState();
				// Ghost tab is pinned (unless it's random)
				if (isRandom || viewState.pinned === true) {
					return leaf;
				}
			}
		}

		return null;
	}

	/**
	 * Open home base in ghost tab (for sticky icon)
	 * Ghost tab is pinned and hidden (if setting enabled)
	 * Only one ghost tab should exist at a time
	 * Works for file-based types and Graph view
	 * Note: Random types don't pin (since file changes each time)
	 * Note: Workspace and None don't work (workspace changes layout, None doesn't open anything)
	 */
	async openHomeBaseInGhostTab(options: {
		runCommand?: boolean;
	} = {}): Promise<boolean> {
		const { runCommand = true } = options;
		const homeBaseSettings = this.plugin.getHomeBaseSettings();
		
		// Workspace and None don't work with ghost tab
		if (homeBaseSettings.type === HomeBaseType.Workspace || 
		    homeBaseSettings.type === HomeBaseType.None) {
			// For these types, just use normal open
			return this.openHomeBaseWithMode('retain', runCommand);
		}

		// Graph view: don't use ghost tab (finding it is unreliable)
		// Just open it normally like random files
		if (homeBaseSettings.type === HomeBaseType.Graph) {
			return this.openGraph();
		}

		// Random types and periodic notes: don't pin (file changes each time)
		// But still allow merging with existing tabs if sticky icon is enabled
		const isRandom = homeBaseSettings.type === HomeBaseType.Random || 
		                 homeBaseSettings.type === HomeBaseType.RandomFolder ||
		                 homeBaseSettings.type === HomeBaseType.DailyNote ||
		                 homeBaseSettings.type === HomeBaseType.WeeklyNote ||
		                 homeBaseSettings.type === HomeBaseType.MonthlyNote ||
		                 homeBaseSettings.type === HomeBaseType.YearlyNote;

		// Check if settings modal is open
		if (this.isSettingsModalOpen()) {
			return false;
		}

		// Resolve the actual file path based on type
		const resolvedPath = await computeHomeBasePath(
			homeBaseSettings.type,
			homeBaseSettings.value,
			this.plugin
		);
		
		if (!resolvedPath) {
			return false;
		}

		// Get the home base file - use metadataCache for better path resolution (like homepage plugin)
		// This is especially important for periodic notes which may have been just created
		let file = this.app.metadataCache.getFirstLinkpathDest(resolvedPath, '/');
		
		// If not found, try getFileByPath as fallback
		if (!file) {
			file = getFileByPath(this.app, resolvedPath);
		}
		
		// For periodic notes, the path might be trimmed (no extension)
		// Try with .md extension if still not found
		if (!file && !resolvedPath.endsWith('.md') && !resolvedPath.endsWith('.canvas') && !resolvedPath.endsWith('.base')) {
			const untrimmedPath = `${resolvedPath}.md`;
			file = getFileByPath(this.app, untrimmedPath);
		}
		
		if (!file) {
			return false;
		}

		// Check if ghost tab already exists
		const ghostTab = this.findGhostTab(file, isRandom);
		
		if (ghostTab) {
			// Ghost tab exists - close any other tabs with the same file, then focus ghost tab
			const allLeaves = LEAF_TYPES.flatMap(type => 
				this.app.workspace.getLeavesOfType(type)
			);
			
			const duplicates: WorkspaceLeaf[] = [];
			for (const leaf of allLeaves) {
				if (leaf !== ghostTab && leafHasFile(leaf, resolvedPath)) {
					duplicates.push(leaf);
				}
			}
			
			for (const leaf of duplicates) {
				void leaf.detach();
			}
			
			// Wait a bit for detachments to complete
			await new Promise(resolve => setTimeout(resolve, 100));
			
			const shouldFocus = !this.isSettingsModalOpen();
			this.app.workspace.setActiveLeaf(ghostTab, { focus: shouldFocus });
			await this.configureView(ghostTab, file);
			
			if (runCommand) {
				this.runCommandOnOpen();
			}
			return true;
		}

		// Ghost tab doesn't exist - create it
		// Close ALL tabs with the same file first (including any non-pinned ones)
		const allLeaves = LEAF_TYPES.flatMap(type => 
			this.app.workspace.getLeavesOfType(type)
		);
		
		const existingTabs: WorkspaceLeaf[] = [];
		for (const leaf of allLeaves) {
			if (leafHasFile(leaf, resolvedPath)) {
				existingTabs.push(leaf);
			}
		}
		
		for (const leaf of existingTabs) {
			void leaf.detach();
		}
		
		// Wait a bit for detachments to complete
		await new Promise(resolve => setTimeout(resolve, 100));

		// Create new ghost tab
		const newGhostTab = this.app.workspace.getLeaf('tab');
		await newGhostTab.openFile(file);
		
		// Pin the ghost tab (unless it's random - file changes each time)
		if (!isRandom) {
			newGhostTab.setPinned(true);
		}
		
		// Focus it
		const shouldFocus = !this.isSettingsModalOpen();
		this.app.workspace.setActiveLeaf(newGhostTab, { focus: shouldFocus });
		
		// Configure the view
		await this.configureView(newGhostTab, file);

		// Run command if configured
		if (runCommand) {
			this.runCommandOnOpen();
		}

		return true;
	}

	/**
	 * Find an empty leaf
	 */
	private findEmptyLeaf(): WorkspaceLeaf | null {
		const leaves = this.app.workspace.getLeavesOfType('empty');
		return leaves[0] || null;
	}

	/**
	 * Get the home base file
	 */
	getHomeBaseFile(): TFile | null {
		const settings = this.plugin.settings;
		if (!settings.homeBasePath) {
			return null;
		}
		return getFileByPath(this.app, settings.homeBasePath);
	}

	/**
	 * Fast detach all leaves using changeLayout (like homepage plugin)
	 * This is much faster than iterating and detaching leaves individually
	 */
	async detachAllLeaves(): Promise<void> {
		const layout = this.app.workspace.getLayout();
		layout.main = {
			"id": "5324373015726ba8",
			"type": "split",
			"children": [{ 
				"id": "4509724f8bf84da7",
				"type": "tabs",
				"children": [{
					"id": "e7a7b303c61786dc",
					"type": "leaf",
					"state": {"type": "empty", "state": {}, "icon": "lucide-file", "title": "New tab"}
				}]
			}],
			"direction": "vertical"
		};
		layout.active = "e7a7b303c61786dc";
		await this.app.workspace.changeLayout(layout);
		
		if (Platform.isMobile) {
			 
			(this.app.workspace.rightSplit as { updateInfo?: () => void })?.updateInfo?.();
		}
	}

	/**
	 * Close all leaves in the main workspace except the specified one
	 * Simplified approach: iterate all leaves and close those in main workspace
	 */
	async closeAllLeavesExcept(exceptLeaf: WorkspaceLeaf | null): Promise<void> {
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
			} else {
				// If we can't find container, still try to close it if it's in main workspace
				// This handles edge cases where container detection fails
				// Only close if we're closing everything (exceptLeaf is null)
				if (exceptLeaf === null) {
					// Try to get leaf's view state to check if it's a main workspace tab
					try {
						const viewState = leaf.getViewState();
						// If it has a view state, it's likely a main workspace tab
						if (viewState) {
							leavesToClose.push(leaf);
						}
					} catch {
						// If we can't get view state, skip it
					}
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
