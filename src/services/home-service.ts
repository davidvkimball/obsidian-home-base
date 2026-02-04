/**
 * Home Base Service
 * Core logic for opening and managing the home base file
 */

import { App, TFile, WorkspaceLeaf, MarkdownView, Platform, View as OView } from 'obsidian';
import type HomeBasePlugin from '../main';
import { HomeBaseType, OpeningMode } from '../settings';
import { getFileByPath, isMarkdownLike, leafHasFile, isSupportedExtension } from '../utils/file-utils';
import { executeCommand } from '../ui/command-suggest';
import { computeHomeBasePath, trimFile, resolvePathSync } from '../utils/homebase-resolver';

/**
 * View types that can be home base files
 */
const LEAF_TYPES = ['markdown', 'canvas', 'bases', 'kanban'];

/**
 * Timing constants for home service operations
 * These delays ensure Obsidian's internal state is updated before proceeding
 */

/** Short delay for leaf detachment to complete */
const DETACH_DELAY = 100;

/** Delay for graph view initialization */
const GRAPH_INIT_DELAY = 200;

/** Fallback delay when using graph command instead of direct creation */
const GRAPH_COMMAND_FALLBACK_DELAY = 300;

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
	private ghostLeaves: WeakSet<WorkspaceLeaf> = new WeakSet();

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
			// Graph view: support ghost tab if sticky icon is enabled
			if (this.plugin.settings.showStickyHomeIcon) {
				return this.openHomeBaseInGhostTab({ runCommand });
			}
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
					await new Promise(resolve => setTimeout(resolve, DETACH_DELAY));
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
		await new Promise(resolve => setTimeout(resolve, DETACH_DELAY));
		return true;
	}

	/**
	 * Open graph view
	 */
	async openGraph(): Promise<boolean> {

		await this.app.commands?.executeCommandById?.('graph:open');
		return true;
	}

	// Removed deprecated openGraphInGhostTab - now integrated into openHomeBaseInGhostTab

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
		return this.openInLeafWithSettings(leaf, homeBaseSettings);
	}

	/**
	 * Open a file in an empty leaf with custom settings
	 * @param leaf The leaf to open the file in
	 * @param settings Settings object with type and value
	 * @param isNewTab Whether this is for new tab replacement (skips pinning/ghost tab logic)
	 */
	async openInLeafWithSettings(leaf: WorkspaceLeaf, settings: { type: HomeBaseType; value: string }, isNewTab: boolean = false): Promise<boolean> {
		// Handle non-file types
		if (settings.type === HomeBaseType.Workspace) {
			await this.openWorkspace(settings.value);
			return true;
		}
		if (settings.type === HomeBaseType.Graph) {
			await this.openGraph();
			return true;
		}
		if (settings.type === HomeBaseType.None) {
			this.runCommandOnOpen();
			return true;
		}

		// Resolve the actual file path based on type
		const resolvedPath = await computeHomeBasePath(
			settings.type,
			settings.value,
			this.plugin
		);

		if (!resolvedPath) {
			// Log warning for debugging - file path couldn't be resolved
			console.warn('[Home Base] Could not resolve path for new tab:', settings.type, settings.value);
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
			// Log warning for debugging - file not found
			console.warn('[Home Base] File not found for new tab:', resolvedPath);
			return false;
		}

		// For new tab replacement: just open the file, no pinning, no ghost tab logic
		// Multiple tabs with the same file are fine
		// CRITICAL: When isNewTab=true, completely bypass ALL ghost tab logic
		if (isNewTab) {
			console.debug('[Home Base] openInLeafWithSettings: isNewTab=true, bypassing ghost tab logic', {
				file: file.path,
				settings: settings
			});
			await leaf.openFile(file);
			await this.configureView(leaf, file);
			this.runCommandOnOpen();
			return true;
		}

		// For home base: use ghost tab/pinning logic (existing behavior)
		// If sticky icon is enabled AND this is a truly empty tab (not a file opened from explorer),
		// check if there's a ghost tab and merge with it.
		// This ensures that when you close the last tab and Obsidian creates a new empty one,
		// it merges with the ghost tab instead of creating a duplicate.
		// BUT: If the user manually opened a file from explorer, we should NOT merge - let them have their tab.
		const isTrulyEmpty = !leaf.view || leaf.view.getViewType() === 'empty';

		if (this.plugin.settings.showStickyHomeIcon && isTrulyEmpty) {
			// Random types and periodic notes: don't pin, but can still merge
			const isRandom = settings.type === HomeBaseType.Random ||
				settings.type === HomeBaseType.RandomFolder ||
				settings.type === HomeBaseType.DailyNote ||
				settings.type === HomeBaseType.WeeklyNote ||
				settings.type === HomeBaseType.MonthlyNote ||
				settings.type === HomeBaseType.YearlyNote;
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
			this.ghostLeaves.add(leaf);
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
		const config = this.app.vault.config;
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
	 * Check if a leaf is a ghost tab
	 * Ghost tab is identified by being in our internal ghostLeaves set
	 * Only tabs specifically created for the sticky icon are ghost tabs
	 */
	isGhostLeaf(leaf: WorkspaceLeaf): boolean {
		return this.ghostLeaves.has(leaf);
	}

	/**
	 * Find the ghost tab (the one opened via sticky icon)
	 * Ghost tab is identified by being in our internal ghostLeaves set
	 * Only returns existing ghost tabs, doesn't create new ones
	 */
	findGhostTab(file?: TFile, isRandom: boolean = false): WorkspaceLeaf | null {
		if (!file) return null;
		const homeBasePath = file.path;

		// Use iterateAllLeaves instead of getLeavesOfType to find tabs even when hidden (zen mode, etc.)
		const leaves: WorkspaceLeaf[] = [];
		this.app.workspace.iterateAllLeaves((leaf) => {
			const viewType = leaf.view?.getViewType();
			if (viewType && LEAF_TYPES.includes(viewType)) {
				leaves.push(leaf);
			}
		});

		// Check for a match in our WeakSet
		for (const leaf of leaves) {
			if (this.ghostLeaves.has(leaf) && leafHasFile(leaf, homeBasePath)) {
				return leaf;
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

		// Handle non-file types (Workspace and None don't work with ghost tab)
		if (homeBaseSettings.type === HomeBaseType.Workspace ||
			homeBaseSettings.type === HomeBaseType.None) {
			// For these types, just use normal open
			return this.openHomeBaseWithMode('retain', runCommand);
		}

		// Graph view handling
		if (homeBaseSettings.type === HomeBaseType.Graph) {
			// Find existing graph ghost tab
			let ghostTab = this.findGraphGhostTab();

			if (ghostTab) {
				this.ghostLeaves.add(ghostTab);
				ghostTab.setPinned(true);
				this.app.workspace.setActiveLeaf(ghostTab, { focus: !this.isSettingsModalOpen() });
				if (runCommand) this.runCommandOnOpen();
				return true;
			}

			// Create new graph tab
			const newLeaf = this.app.workspace.getLeaf('tab');
			if (newLeaf) {
				await newLeaf.setViewState({ type: 'graph', state: {} });
				await new Promise(resolve => setTimeout(resolve, GRAPH_INIT_DELAY));

				this.ghostLeaves.add(newLeaf);
				newLeaf.setPinned(true);
				this.app.workspace.setActiveLeaf(newLeaf, { focus: !this.isSettingsModalOpen() });
				if (runCommand) this.runCommandOnOpen();
				return true;
			}

			// Fallback to command
			await this.openGraph();
			await new Promise(resolve => setTimeout(resolve, GRAPH_COMMAND_FALLBACK_DELAY));
			ghostTab = this.findGraphGhostTab();
			if (ghostTab) {
				this.ghostLeaves.add(ghostTab);
				ghostTab.setPinned(true);
				this.app.workspace.setActiveLeaf(ghostTab, { focus: !this.isSettingsModalOpen() });
				if (runCommand) this.runCommandOnOpen();
				return true;
			}
			return false;
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

		console.debug('[Home Base] openHomeBaseInGhostTab:', {
			file: file.path,
			ghostTabFound: !!ghostTab,
			isRandom: isRandom,
			zenMode: document.body.classList.contains('zenmode-active')
		});

		if (ghostTab) {
			// Ghost tab exists - just jump to it, don't close other tabs
			// User can have multiple home base tabs open, but clicking sticky icon jumps to the "occupied" one
			const shouldFocus = !this.isSettingsModalOpen();
			this.app.workspace.setActiveLeaf(ghostTab, { focus: shouldFocus });
			await this.configureView(ghostTab, file);

			if (runCommand) {
				this.runCommandOnOpen();
			}
			return true;
		}

		// Ghost tab doesn't exist - create it
		// Don't close existing tabs - user can have multiple home base tabs
		// The first one we create will "occupy" the ghost tab slot (be pinned and hidden)

		// Create new ghost tab
		const newGhostTab = this.app.workspace.getLeaf('tab');
		this.ghostLeaves.add(newGhostTab);
		await newGhostTab.openFile(file);

		// Pin the ghost tab (unless it's random - file changes each time)
		if (!isRandom) {
			newGhostTab.setPinned(true);
		}

		// Mark the tab header immediately after pinning (for auto-hide tab counting)
		// Use a small delay to ensure the tab header exists
		setTimeout(() => {
			this.plugin.stickyTabService.updateTabHeaders();
		}, 50);

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
		const homeBaseSettings = this.plugin.getHomeBaseSettings();
		const path = resolvePathSync(homeBaseSettings.type, homeBaseSettings.value, this.app);
		if (!path) return null;

		return getFileByPath(this.app, path);
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
					"state": { "type": "empty", "state": {}, "icon": "lucide-file", "title": "New tab" }
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
	 * Find an existing graph leaf that should be treated as a ghost tab
	 */
	private findGraphGhostTab(): WorkspaceLeaf | null {
		let graphLeaves: WorkspaceLeaf[] = [];
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view?.getViewType() === 'graph') {
				graphLeaves.push(leaf);
			}
		});

		// Prefer pinned graph view
		const pinned = graphLeaves.find(l => l.getViewState().pinned === true);
		if (pinned) return pinned;

		// Fallback to first graph view if only one exists
		if (graphLeaves.length === 1 && graphLeaves[0]) return graphLeaves[0];

		return null;
	}

	/**
	 * Check if the focused tab is the home base
	 */
	isFocusedOnHomeBase(): boolean {
		const activeLeaf = this.app.workspace.getActiveViewOfType(OView)?.leaf;
		if (!activeLeaf) return false;

		const homeBaseSettings = this.plugin.getHomeBaseSettings();

		// Handle Graph view
		if (homeBaseSettings.type === HomeBaseType.Graph) {
			return activeLeaf.view?.getViewType() === 'graph';
		}

		// Handle file-based types
		const homeBaseFile = this.getHomeBaseFile();
		if (!homeBaseFile) return false;

		return leafHasFile(activeLeaf, homeBaseFile.path);
	}

	/**
	 * Check if home base file exists
	 */
	homeBaseExists(): boolean {
		const homeBaseSettings = this.plugin.getHomeBaseSettings();
		const path = resolvePathSync(homeBaseSettings.type, homeBaseSettings.value, this.app);
		if (!path) return false;

		return getFileByPath(this.app, path) !== null;
	}

	/**
	 * Get the native Obsidian open behavior setting (from app.json)
	 * @returns The native setting value or undefined if not supported/found
	 */
	getNativeOpenBehavior(): string | undefined {
		// The config property is added via internal type augmentation
		const config = this.app.vault.config;
		if (!config) return undefined;

		return config.openBehavior;
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

		if (this.plugin.settings.separateMobile && Platform.isMobile) {
			this.plugin.settings.mobileHomeBaseType = HomeBaseType.File;
			this.plugin.settings.mobileHomeBaseValue = activeFile.path;
		} else {
			this.plugin.settings.homeBaseType = HomeBaseType.File;
			this.plugin.settings.homeBaseValue = activeFile.path;
		}

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

	/**
	 * Restore ghost leaves from previous session
	 * This identifies pinned home base tabs that should be treated as ghost leaves
	 */
	restoreGhostLeaves(): void {
		if (!this.plugin.settings.showStickyHomeIcon) {
			return;
		}

		const homeBaseSettings = this.plugin.getHomeBaseSettings();
		const homeBasePath = resolvePathSync(homeBaseSettings.type, homeBaseSettings.value, this.app);

		// For file-based types, we need a path
		if (!homeBasePath && homeBaseSettings.type !== HomeBaseType.Graph) return;

		// For random/dynamic types, we don't restore ghost leaves
		const isRandom = homeBaseSettings.type === HomeBaseType.Random ||
			homeBaseSettings.type === HomeBaseType.RandomFolder ||
			homeBaseSettings.type === HomeBaseType.DailyNote ||
			homeBaseSettings.type === HomeBaseType.WeeklyNote ||
			homeBaseSettings.type === HomeBaseType.MonthlyNote ||
			homeBaseSettings.type === HomeBaseType.YearlyNote;

		if (isRandom) return;

		// Handle Graph view
		if (homeBaseSettings.type === HomeBaseType.Graph) {
			const ghostTab = this.findGraphGhostTab();
			if (ghostTab && ghostTab.getViewState().pinned === true) {
				this.ghostLeaves.add(ghostTab);
			}
			return;
		}

		// Find pinned home base tabs and mark the first one as a ghost leaf
		const leaves: WorkspaceLeaf[] = [];
		this.app.workspace.iterateAllLeaves((leaf) => {
			const viewType = leaf.view?.getViewType();
			if (viewType && LEAF_TYPES.includes(viewType)) {
				leaves.push(leaf);
			}
		});

		for (const leaf of leaves) {
			if (homeBasePath && leafHasFile(leaf, homeBasePath)) {
				const viewState = leaf.getViewState();
				if (viewState.pinned === true && !this.ghostLeaves.has(leaf)) {
					// Found a pinned home base tab - mark it as ghost
					this.ghostLeaves.add(leaf);
					// Only restore one ghost leaf (the first pinned home base tab)
					break;
				}
			}
		}
	}
}
