/**
 * Sticky Tab Service
 * Manages the sticky home icon in the tab bar
 */

import { Menu, Platform, setIcon, WorkspaceLeaf } from 'obsidian';
import type HomeBasePlugin from '../main';
import { leafHasFile } from '../utils/file-utils';

/**
 * CSS class for the sticky home icon container
 */
const STICKY_ICON_CLASS = 'home-base-sticky-icon';
const STICKY_ICON_ACTIVE_CLASS = 'home-base-sticky-icon-active';

/**
 * Extended HTMLElement interface for sticky icon with custom properties
 */
interface StickyIconElement extends HTMLElement {
	_checkInterval?: ReturnType<typeof setInterval>;
	_containerObserver?: MutationObserver;
}

export class StickyTabService {
	private plugin: HomeBasePlugin;
	private stickyIconEl: StickyIconElement | null = null;
	private layoutChangeHandler: (() => void) | null = null;
	private tabHeaderUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(plugin: HomeBasePlugin) {
		this.plugin = plugin;
	}

	/**
	 * Update the sticky tab icon based on settings
	 */
	update(): void {
		// Only show on desktop
		if (Platform.isMobile) {
			this.remove();
			this.updateTabHeaders(); // Clean up tab headers
			this.updateWorkspaceClass(false);
			return;
		}

		if (this.plugin.settings.showStickyHomeIcon) {
			this.create();
			this.updateWorkspaceClass(true);
		} else {
			this.remove();
			this.updateTabHeaders(); // Clean up tab headers when removing icon
			this.updateWorkspaceClass(false);
		}
	}

	/**
	 * Add/remove CSS class on workspace to conditionally apply styles
	 */
	private updateWorkspaceClass(enabled: boolean): void {
		const mainWorkspace = document.querySelector('.workspace-split.mod-vertical.mod-root');
		if (!mainWorkspace) return;

		if (enabled) {
			mainWorkspace.classList.add('home-base-sticky-icon-enabled');
		} else {
			mainWorkspace.classList.remove('home-base-sticky-icon-enabled');
		}
	}

	/**
	 * Create the sticky home icon
	 */
	private create(): void {
		// Remove existing icon first
		this.remove();

		// Create the sticky icon element once
		this.stickyIconEl = document.createElement('div');
		this.stickyIconEl.className = `${STICKY_ICON_CLASS} clickable-icon`;
		this.stickyIconEl.setAttribute('aria-label', 'Open home base');
		this.stickyIconEl.setAttribute('data-tooltip-position', 'bottom');

		// Add the home icon
		setIcon(this.stickyIconEl, 'home');

		// Add click handler
		this.stickyIconEl.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			
			// Open home base and update tab headers after opening
			void this.plugin.homeService.openHomeBase({
				replaceActiveLeaf: this.plugin.settings.stickyIconReplaceTab,
				runCommand: true,
			}).then(() => {
				// Update tab headers after opening, with a slight delay to let animations complete
				setTimeout(() => {
					this.updateTabHeaders();
				}, 150);
			});
		});

		// Add context menu for closing home base
		this.stickyIconEl.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			e.stopPropagation();
			
			const menu = new Menu();
			menu.addItem((item) => {
				item
					.setTitle('Close home base')
					.setIcon('x')
					.onClick(() => {
						void this.closeHomeBase();
					});
			});
			menu.showAtMouseEvent(e);
		});

		// Function to ensure icon is in the right place
		// Insert it into the workspace-tabs container so it's positioned relative to tabs
		const ensureIconInPlace = () => {
			if (!this.stickyIconEl) return;

			const mainWorkspace = document.querySelector('.workspace-split.mod-vertical.mod-root');
			if (!mainWorkspace) return;

			// Find the workspace-tabs container (sibling of workspace-tab-container)
			const workspaceTabs = mainWorkspace.querySelector('.workspace-tabs');
			if (!workspaceTabs) return;

			// Check if icon is already in the tabs container
			const existingIcon = workspaceTabs.querySelector(`.${STICKY_ICON_CLASS}`);
			if (existingIcon === this.stickyIconEl) {
				// Already in place, nothing to do
				return;
			}

			// Icon is missing - insert it into the workspace-tabs container
			// This way it's positioned relative to the tab bar but won't move with tabs
			workspaceTabs.appendChild(this.stickyIconEl);

			// Update active state after insertion
			this.updateActiveState();
			
			// Update tab headers when icon is created
			this.updateTabHeaders();
			
			// Ensure workspace class is set
			this.updateWorkspaceClass(true);
		};

		// Try to insert immediately
		ensureIconInPlace();

		// Set up a reliable check that runs periodically to ensure icon is always there
		// This is simple and reliable - just check if it's there, if not, put it back
		const checkInterval = setInterval(() => {
			if (!this.stickyIconEl || !this.plugin.settings.showStickyHomeIcon) {
				clearInterval(checkInterval);
				return;
			}
			ensureIconInPlace();
		}, 100); // Check every 100ms - more frequent to catch container recreation immediately

		// Store interval so we can clear it later
		this.stickyIconEl._checkInterval = checkInterval;

		// Also check on layout changes - but do it immediately, no delay
		if (!this.layoutChangeHandler) {
			this.layoutChangeHandler = () => {
				if (this.stickyIconEl && this.plugin.settings.showStickyHomeIcon) {
					// Check immediately - don't wait for layout to settle
					// This prevents flickering when tabs close
					ensureIconInPlace();
					// Update tab headers on layout change
					this.updateTabHeaders();
				}
			};

			this.plugin.registerEvent(
				this.plugin.app.workspace.on('layout-change', this.layoutChangeHandler)
			);
		}

		// Also watch for when workspace-tabs container is added back (after all tabs closed)
		// Use a MutationObserver on the workspace split to catch container recreation
		const mainWorkspace = document.querySelector('.workspace-split.mod-vertical.mod-root');
		if (mainWorkspace) {
			const containerObserver = new MutationObserver(() => {
				if (!this.stickyIconEl || !this.plugin.settings.showStickyHomeIcon) return;
				
				// Check if workspace-tabs container exists and icon is missing
				const workspaceTabs = mainWorkspace.querySelector('.workspace-tabs');
				if (workspaceTabs) {
					const existingIcon = workspaceTabs.querySelector(`.${STICKY_ICON_CLASS}`);
					if (!existingIcon || existingIcon !== this.stickyIconEl) {
						// Container exists but icon is missing - re-insert immediately
						workspaceTabs.appendChild(this.stickyIconEl);
						this.updateActiveState();
					}
				}
			});

			containerObserver.observe(mainWorkspace, {
				childList: true,
				subtree: false, // Only watch direct children
			});

			// Store observer so we can clean it up
			this.stickyIconEl._containerObserver = containerObserver;
		}
	}

	/**
	 * Remove the sticky home icon
	 */
	remove(): void {
		// Clear any pending tab header updates
		if (this.tabHeaderUpdateTimeout) {
			clearTimeout(this.tabHeaderUpdateTimeout);
			this.tabHeaderUpdateTimeout = null;
		}

		// Clear any check intervals
		if (this.stickyIconEl && this.stickyIconEl._checkInterval) {
			clearInterval(this.stickyIconEl._checkInterval);
		}

		// Disconnect container observer
		if (this.stickyIconEl && this.stickyIconEl._containerObserver) {
			this.stickyIconEl._containerObserver.disconnect();
		}

		if (this.stickyIconEl) {
			// Only remove if it's actually in the DOM
			if (this.stickyIconEl.parentElement) {
				this.stickyIconEl.remove();
			}
			this.stickyIconEl = null;
		}

		// Also clean up any orphaned icons
		document.querySelectorAll(`.${STICKY_ICON_CLASS}`).forEach(el => {
			const stickyEl = el as StickyIconElement;
			if (stickyEl._checkInterval) {
				clearInterval(stickyEl._checkInterval);
			}
			if (stickyEl._containerObserver) {
				stickyEl._containerObserver.disconnect();
			}
			el.remove();
		});
	}

	/**
	 * Update the active state of the sticky icon
	 */
	updateActiveState(): void {
		if (!this.stickyIconEl) return;

		const isActive = this.plugin.homeService.isFocusedOnHomeBase();
		
		if (isActive) {
			this.stickyIconEl.classList.add(STICKY_ICON_ACTIVE_CLASS);
		} else {
			this.stickyIconEl.classList.remove(STICKY_ICON_ACTIVE_CLASS);
		}

		// Also update tab headers when active state changes (debounced)
		this.updateTabHeaders();
	}

	/**
	 * Toggle the sticky icon visibility
	 */
	async toggle(): Promise<void> {
		this.plugin.settings.showStickyHomeIcon = !this.plugin.settings.showStickyHomeIcon;
		await this.plugin.saveSettings();
		this.update();
		// Update tab headers when toggling sticky icon
		this.updateTabHeaders();
	}

	/**
	 * Update tab headers to hide/show home base tab
	 * Only works when sticky icon is enabled
	 * Debounced to prevent flickering during tab transitions
	 */
	updateTabHeaders(): void {
		// Clear any pending update
		if (this.tabHeaderUpdateTimeout) {
			clearTimeout(this.tabHeaderUpdateTimeout);
		}

		// Debounce the update to avoid flickering during tab animations
		this.tabHeaderUpdateTimeout = setTimeout(() => {
			this.tabHeaderUpdateTimeout = null;
			this._doUpdateTabHeaders();
		}, 100); // Small delay to let tab animations complete
	}

	/**
	 * Internal method that actually updates the tab headers
	 */
	private _doUpdateTabHeaders(): void {
		// Only hide tabs if BOTH sticky icon AND hide tab header are enabled
		if (!this.plugin.settings.showStickyHomeIcon || !this.plugin.settings.hideHomeTabHeader) {
			// Remove all home base tab classes if either setting is disabled
			document.querySelectorAll('.is-home-base-tab').forEach(el => {
				el.classList.remove('is-home-base-tab');
			});
			return;
		}

		const homeBasePath = this.plugin.settings.homeBasePath;
		if (!homeBasePath) return;

		// Use requestAnimationFrame to ensure DOM is ready
		requestAnimationFrame(() => {
			// Iterate all leaves and tag home base tabs
			this.plugin.app.workspace.iterateAllLeaves((leaf) => {
				const isHomeBase = leafHasFile(leaf, homeBasePath);
				const tabHeader = this.getTabHeaderForLeaf(leaf);
				
				if (tabHeader) {
					if (isHomeBase) {
						tabHeader.classList.add('is-home-base-tab');
					} else {
						tabHeader.classList.remove('is-home-base-tab');
					}
				}
			});
		});
	}

	/**
	 * Get the tab header element for a given leaf
	 */
	private getTabHeaderForLeaf(leaf: WorkspaceLeaf): HTMLElement | null {
		// Try to get from leaf's internal property first (if available)
		const leafAny = leaf as unknown as { tabHeaderEl?: HTMLElement };
		if (leafAny.tabHeaderEl) {
			return leafAny.tabHeaderEl;
		}

		// Fallback: find by querying DOM
		const viewType = leaf.view?.getViewType();
		if (!viewType) return null;

		// Get the active leaf to help with matching
		const activeLeaf = this.plugin.app.workspace.getMostRecentLeaf();
		const isActive = leaf === activeLeaf;

		// Find all tab headers with matching view type
		const tabHeaders = document.querySelectorAll(`.workspace-tab-header[data-type="${viewType}"]`);
		
		// If this is the active leaf, prefer the active tab header
		if (isActive) {
			const activeHeader = document.querySelector('.workspace-tab-header.is-active');
			if (activeHeader && activeHeader.getAttribute('data-type') === viewType) {
				return activeHeader as HTMLElement;
			}
		}

		// Try to match by checking if header's leaf property matches
		for (const header of Array.from(tabHeaders)) {
			const headerEl = header as HTMLElement;
			const headerElWithLeaf = headerEl as unknown as { leaf?: WorkspaceLeaf };
			const headerLeaf = headerElWithLeaf.leaf;
			if (headerLeaf === leaf) {
				return headerEl;
			}
		}

		// If only one tab header matches the view type, it's likely the one
		if (tabHeaders.length === 1) {
			return tabHeaders[0] as HTMLElement;
		}

		// Last resort: if this is active and we found an active header, use it
		if (isActive) {
			const activeHeader = document.querySelector('.workspace-tab-header.is-active');
			if (activeHeader) {
				return activeHeader as HTMLElement;
			}
		}

		return null;
	}

	/**
	 * Close the home base tab
	 */
	async closeHomeBase(): Promise<void> {
		const homeBasePath = this.plugin.settings.homeBasePath;
		if (!homeBasePath) return;

		const { getFileByPath } = await import('../utils/file-utils');
		const homeBaseFile = getFileByPath(this.plugin.app, homeBasePath);
		if (!homeBaseFile) return;

		const homeBaseLeaf = this.plugin.homeService.findExistingHomeBaseLeaf(homeBaseFile);
		if (homeBaseLeaf) {
			homeBaseLeaf.detach();
			// Update tab headers after closing
			this.updateTabHeaders();
		}
	}
}
