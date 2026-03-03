/**
 * Sticky Tab Service
 * Manages the sticky home icon in the tab bar
 */

import { Menu, Platform, setIcon, WorkspaceLeaf } from 'obsidian';
import type HomeBasePlugin from '../main';
import { HomeBaseType } from '../settings';
import { getFileByPath, leafHasFile } from '../utils/file-utils';
import { resolvePathSync } from '../utils/homebase-resolver';
import { IconPicker } from '../ui/icon-picker';

/**
 * Timing constants for sticky tab operations
 * These delays are necessary for UI updates and DOM monitoring.
 */

/** Delay for tab header updates after opening home base */
const TAB_HEADER_OPEN_DELAY = 150;

/** Interval for periodic icon placement check (ensures it survives DOM updates) */
const ICON_PLACEMENT_CHECK_INTERVAL = 100;

/** Small delay to catch containers in newly opened windows */
const WINDOW_OPEN_CONTAINER_DELAY = 100;

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

/**
 * Extended HTMLElement interface for tab header with home base properties
 */
interface TabHeaderElement extends HTMLElement {
	_homeBaseParent?: HTMLElement;
	_homeBaseNextSibling?: Node | null;
}

export class StickyTabService {
	private plugin: HomeBasePlugin;
	private stickyIconEl: StickyIconElement | null = null;
	private layoutChangeHandler: (() => void) | null = null;
	private tabHeaderUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
	private sidebarObserver: MutationObserver | null = null;
	private tabHeaderObserver: MutationObserver | null = null;

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
			if (this.stickyIconEl) {
				// Icon already exists, just update the icon
				const iconName = this.plugin.settings.stickyIconName || 'home';
				setIcon(this.stickyIconEl, iconName);
			} else {
				// Icon doesn't exist, create it
				this.create();
			}
			this.updateWorkspaceClass(true);
		} else {
			this.remove();
			this.updateTabHeaders(); // Clean up tab headers when removing icon
			this.updateWorkspaceClass(false);
		}
	}

	/**
	 * Add/remove CSS class on all workspaces to conditionally apply styles
	 */
	private updateWorkspaceClass(enabled: boolean): void {
		const applyToDocument = (doc: Document) => {
			const mainWorkspace = doc.querySelector('.workspace-split.mod-vertical.mod-root');
			if (!mainWorkspace) return;

			if (enabled) {
				mainWorkspace.classList.add('home-base-sticky-icon-enabled');
			} else {
				mainWorkspace.classList.remove('home-base-sticky-icon-enabled');
			}
		};

		// Apply to main window
		applyToDocument(document);

		// Apply to all other windows
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const doc = leaf.view?.containerEl?.ownerDocument;
			if (doc && doc !== document) {
				applyToDocument(doc);
			}
		});
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

		// Add the icon from settings (default to 'home')
		const iconName = this.plugin.settings.stickyIconName || 'home';
		setIcon(this.stickyIconEl, iconName);

		// Add click handler
		this.stickyIconEl.addEventListener('click', e => {
			e.preventDefault();
			e.stopPropagation();

			// Open home base in ghost tab (always use ghost tab for sticky icon)
			void this.plugin.homeService.openHomeBaseInGhostTab({
				runCommand: true,
			}).then(() => {
				// Update tab headers after opening, with a slight delay to let animations complete
				setTimeout(() => {
					this.updateTabHeaders();
				}, TAB_HEADER_OPEN_DELAY);
			});
		});

		// Add context menu for changing icon and closing home base
		this.stickyIconEl.addEventListener('contextmenu', e => {
			e.preventDefault();
			e.stopPropagation();

			const menu = new Menu();

			// Add Close home base option (first)
			menu.addItem((item) => {
				item
					.setTitle('Close home base')
					.setIcon('x')
					.onClick(() => {
						// Actually close it (including ghost tab if sticky icon is enabled)
						// If new tab replacement is enabled, it will reopen when you create a new tab
						void this.closeHomeBase(true);
					});
			});

			// Add Change icon option (second)
			menu.addItem((item) => {
				item
					.setTitle('Change icon')
					.setIcon('lucide-image-plus')
					.onClick(() => {
						const picker = new IconPicker(
							this.plugin.app,
							this.plugin.settings.stickyIconName,
							(icon: string | null) => {
								void (async () => {
									this.plugin.settings.stickyIconName = icon;
									await this.plugin.saveSettings();
									// Update the icon display
									if (this.stickyIconEl) {
										setIcon(this.stickyIconEl, icon || 'home');
									}
								})();
							}
						);
						picker.open();
					});
			});
			menu.showAtMouseEvent(e);
		});

		// Function to ensure icon is in the right place
		// Insert it into the workspace-tab-header-container-inner so it's part of the tab bar structure
		// This makes it automatically hide when plugins/themes hide the tab bar
		const ensureIconInPlace = () => {
			if (!this.stickyIconEl) return;

			const mainWorkspace = document.querySelector('.workspace-split.mod-vertical.mod-root');
			if (!mainWorkspace) return;

			// Find the workspace-tab-header-container-inner (inside the tab container)
			const tabHeaderContainerInner = mainWorkspace.querySelector('.workspace-tab-header-container-inner');
			if (!tabHeaderContainerInner) return;

			// Remove any duplicate icons first (in case mutation observer or other code created them)
			const allIcons = tabHeaderContainerInner.querySelectorAll(`.${STICKY_ICON_CLASS}`);
			allIcons.forEach((icon) => {
				if (icon !== this.stickyIconEl) {
					icon.remove();
				}
			});

			// Check if our icon is already in the container
			if (tabHeaderContainerInner.contains(this.stickyIconEl)) {
				// Already in place, nothing to do
				return;
			}

			// Icon is missing - prepend it to the tab header container inner
			// This makes it part of the tab bar structure, so it hides automatically when tabs are hidden
			tabHeaderContainerInner.insertBefore(this.stickyIconEl, tabHeaderContainerInner.firstChild);

			// Update active state after insertion
			this.updateActiveState();

			// Update tab headers when icon is created
			this.updateTabHeaders();

			// Ensure workspace class is set
			this.updateWorkspaceClass(true);

			// Update icon position based on sidebar state
			this.updateIconPositionForSidebar();

			// Watch for sidebar collapse/expand changes
			this.watchSidebarState();
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
		}, ICON_PLACEMENT_CHECK_INTERVAL); // Check every 100ms - more frequent to catch container recreation immediately

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

		// Also watch for when workspace-tab-header-container-inner is added back (after all tabs closed)
		// Use a MutationObserver on the workspace split to catch container recreation
		const mainWorkspace = document.querySelector('.workspace-split.mod-vertical.mod-root');
		if (mainWorkspace) {
			const containerObserver = new MutationObserver(() => {
				if (!this.stickyIconEl || !this.plugin.settings.showStickyHomeIcon) return;

				// Check if tab header container inner exists and icon is missing
				const tabHeaderContainerInner = mainWorkspace.querySelector('.workspace-tab-header-container-inner');
				if (tabHeaderContainerInner) {
					// Remove any duplicate icons first
					const allIcons = tabHeaderContainerInner.querySelectorAll(`.${STICKY_ICON_CLASS}`);
					allIcons.forEach((icon) => {
						if (icon !== this.stickyIconEl) {
							icon.remove();
						}
					});

					// Only re-insert if our icon is not already in the container
					if (!tabHeaderContainerInner.contains(this.stickyIconEl)) {
						// Container exists but icon is missing - re-insert immediately
						tabHeaderContainerInner.insertBefore(this.stickyIconEl, tabHeaderContainerInner.firstChild);
						this.updateActiveState();
					}
				}
			});

			containerObserver.observe(mainWorkspace, {
				childList: true,
				subtree: true, // Watch subtree to catch tab container recreation
			});

			// Store observer so we can clean it up
			this.stickyIconEl._containerObserver = containerObserver;
		}

		// Set up MutationObserver to watch for new tab headers and remove ghost tabs immediately
		this.setupTabHeaderObserver();
	}

	/**
	 * Set up MutationObserver to watch for tab header changes and remove ghost tabs immediately
	 * This prevents the flash when tabs are opened/closed
	 */
	private setupTabHeaderObserver(): void {
		if (this.tabHeaderObserver) {
			return; // Already set up
		}

		this.tabHeaderObserver = new MutationObserver((mutations) => {
			// Only process if settings are enabled
			if (!this.plugin.settings.showStickyHomeIcon || !this.plugin.settings.hideHomeTabHeader) {
				return;
			}

			// Check if any new tab headers were added
			let hasNewHeaders = false;
			for (const mutation of mutations) {
				if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
					for (const node of Array.from(mutation.addedNodes)) {
						if (node instanceof HTMLElement && node.classList.contains('workspace-tab-header')) {
							hasNewHeaders = true;
							break;
						}
					}
				}
				if (hasNewHeaders) break;
			}

			if (hasNewHeaders) {
				// Immediately remove any ghost tab headers that appeared
				this.plugin.app.workspace.iterateAllLeaves((leaf) => {
					// Only process leaves in the main workspace (not sidebars)
					const view = leaf.view;
					let container: HTMLElement | null = null;

					if (view) {
						const viewAny = view as unknown as { containerEl?: HTMLElement };
						container = viewAny.containerEl || null;
					}

					if (!container) {
						const leafAny = leaf as unknown as { containerEl?: HTMLElement };
						container = leafAny.containerEl || null;
					}

					if (container) {
						// Check if it's in the main workspace (root, not sidebar)
						const rootWorkspace = container.closest('.workspace-split.mod-vertical.mod-root');
						const leftSidebar = container.closest('.workspace-split.mod-left-split');
						const rightSidebar = container.closest('.workspace-split.mod-right-split');

						// Only process main workspace leaves
						if (rootWorkspace && !leftSidebar && !rightSidebar) {
							if (this.plugin.homeService.isGhostLeaf(leaf)) {
								const tabHeader = this.getTabHeaderForLeaf(leaf);
								if (tabHeader && tabHeader.parentElement) {
									const parent = tabHeader.parentElement;
									if (parent && parent.classList.contains('workspace-tab-header-container-inner')) {
										const tabHeaderExtended = tabHeader as TabHeaderElement;
										// Only remove if not already removed
										if (parent.contains(tabHeader)) {
											tabHeaderExtended._homeBaseParent = parent;
											tabHeaderExtended._homeBaseNextSibling = tabHeader.nextSibling;
											tabHeader.remove();
										}
									}
								}
							}
						}
					}
				});
			}
		});

		const observeContainer = (container: Element) => {
			this.tabHeaderObserver?.observe(container, {
				childList: true,
				subtree: false
			});
		};

		// Observe all existing containers in all windows
		const observeAllWindows = () => {
			const containers = document.querySelectorAll('.workspace-tab-header-container-inner');
			containers.forEach(observeContainer);

			this.plugin.app.workspace.iterateAllLeaves((leaf) => {
				const doc = leaf.view?.containerEl?.ownerDocument;
				if (doc && doc !== document) {
					const windowContainers = doc.querySelectorAll('.workspace-tab-header-container-inner');
					windowContainers.forEach(observeContainer);
				}
			});
		};

		observeAllWindows();

		// Also watch for new containers being added in all windows
		const setupWorkspaceObserver = (win: Window) => {
			const doc = win.document;
			const workspaceObserver = new MutationObserver(() => {
				const newContainers = doc.querySelectorAll('.workspace-tab-header-container-inner');
				newContainers.forEach(observeContainer);
			});

			const mainWorkspace = doc.querySelector('.workspace-split.mod-vertical.mod-root');
			if (mainWorkspace) {
				workspaceObserver.observe(mainWorkspace, {
					childList: true,
					subtree: true
				});
			}
		};

		setupWorkspaceObserver(window);

		// Register for future windows
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('window-open', (win) => {
				const actualWindow = win.win;
				if (actualWindow instanceof Window) {
					setupWorkspaceObserver(actualWindow);
					// Re-run observe all to catch containers in the new window
					setTimeout(observeAllWindows, WINDOW_OPEN_CONTAINER_DELAY);
				}
			})
		);
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

		// Disconnect sidebar observer
		if (this.sidebarObserver) {
			this.sidebarObserver.disconnect();
			this.sidebarObserver = null;
		}

		// Disconnect tab header observer
		if (this.tabHeaderObserver) {
			this.tabHeaderObserver.disconnect();
			this.tabHeaderObserver = null;
		}

		// RESTORE EVERYTHING before fully removing
		// This ensures tab headers are visible again and workspace classes are removed
		this.updateWorkspaceClass(false);

		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			// Only process leaves in the main workspace (not sidebars)
			const view = leaf.view;
			let container: HTMLElement | null = null;

			if (view) {
				const viewAny = view as unknown as { containerEl?: HTMLElement };
				container = viewAny.containerEl || null;
			}

			if (!container) {
				const leafAny = leaf as unknown as { containerEl?: HTMLElement };
				container = leafAny.containerEl || null;
			}

			if (container) {
				// Check if it's in the main workspace (root, not sidebar)
				const rootWorkspace = container.closest('.workspace-split.mod-vertical.mod-root');
				const leftSidebar = container.closest('.workspace-split.mod-left-split');
				const rightSidebar = container.closest('.workspace-split.mod-right-split');

				// Only process main workspace leaves
				if (rootWorkspace && !leftSidebar && !rightSidebar) {
					const tabHeader = this.getTabHeaderForLeaf(leaf);
					if (tabHeader) {
						tabHeader.classList.remove('is-home-base-tab');
						tabHeader.removeAttribute('data-home-base-ghost');
						tabHeader.removeAttribute('aria-hidden');

						const tabHeaderExtended = tabHeader as TabHeaderElement;
						if (tabHeaderExtended._homeBaseParent && !tabHeaderExtended._homeBaseParent.contains(tabHeader)) {
							const parent = tabHeaderExtended._homeBaseParent;
							const nextSibling = tabHeaderExtended._homeBaseNextSibling;
							if (parent) {
								if (nextSibling && nextSibling.parentElement === parent) {
									parent.insertBefore(tabHeader, nextSibling);
								} else {
									parent.appendChild(tabHeader);
								}
							}
							delete tabHeaderExtended._homeBaseParent;
							delete tabHeaderExtended._homeBaseNextSibling;
						}
					}
				}
			}
		});

		if (this.stickyIconEl) {
			// Only remove if it's actually in the DOM
			if (this.stickyIconEl.parentElement) {
				this.stickyIconEl.remove();
			}
			this.stickyIconEl = null;
		}

		// Also clean up any orphaned icons in all windows
		const cleanupOrphans = (doc: Document) => {
			doc.querySelectorAll(`.${STICKY_ICON_CLASS}`).forEach(el => {
				const stickyEl = el as StickyIconElement;
				if (stickyEl._checkInterval) {
					clearInterval(stickyEl._checkInterval);
				}
				if (stickyEl._containerObserver) {
					stickyEl._containerObserver.disconnect();
				}
				el.remove();
			});
		};

		cleanupOrphans(document);
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const doc = leaf.view?.containerEl?.ownerDocument;
			if (doc && doc !== document) {
				cleanupOrphans(doc);
			}
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
	 * Check if the left sidebar is collapsed
	 * Based on obsidian-oxygen-settings implementation
	 */
	private isLeftSidebarCollapsed(): boolean {
		// Use the correct selector for left sidebar
		const leftSidebar = document.querySelector('.workspace-split.mod-left-split') ||
			document.querySelector('.mod-left-split');

		if (!leftSidebar) return false;

		// Check for the is-sidedock-collapsed class - this is the most reliable indicator
		return leftSidebar.classList.contains('is-sidedock-collapsed');
	}

	/**
	 * Update icon position based on sidebar state
	 * Note: With inline positioning, icon flows naturally with tabs, so no special positioning needed
	 */
	updateIconPositionForSidebar(): void {
		// Icon now flows naturally with tabs, no special positioning needed
		// This method is kept for potential future use but currently does nothing
	}

	/**
	 * Update icon visibility based on tab bar visibility
	 * REMOVED: JavaScript-based visibility checking was causing issues
	 * Now relies entirely on CSS which is more reliable
	 */
	updateIconVisibility(): void {
		// Do nothing - let CSS handle all visibility
		// The icon is inside the tab container, so it will hide automatically
		// when the container is hidden by any theme/plugin
	}

	/**
	 * Watch for sidebar state changes and update icon position
	 * Based on obsidian-oxygen-settings implementation
	 */
	private watchSidebarState(): void {
		if (this.sidebarObserver) {
			this.sidebarObserver.disconnect();
		}

		const leftSidebar = document.querySelector('.workspace-split.mod-left-split') ||
			document.querySelector('.mod-left-split');

		if (!leftSidebar) return;

		// Watch for class changes on the sidebar element
		this.sidebarObserver = new MutationObserver((mutations) => {
			let shouldUpdate = false;
			mutations.forEach((mutation) => {
				if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
					shouldUpdate = true;
				}
			});
			if (shouldUpdate) {
				this.updateIconPositionForSidebar();
			}
		});

		this.sidebarObserver.observe(leftSidebar, {
			attributes: true,
			attributeFilter: ['class'],
		});
	}

	/**
	 * Watch for tab bar visibility changes (Oxygen theme auto-hide, focus mode, etc.)
	 * REMOVED: No longer needed - CSS handles all visibility automatically
	 */
	private watchTabBarVisibility(): void {
		// Do nothing - CSS handles all visibility
		// The icon is inside the tab container, so it hides automatically
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
	 * Update tab headers to hide/show ghost tab
	 * Only works when sticky icon is enabled
	 * Removed debounce - must be immediate to prevent flash
	 */
	updateTabHeaders(): void {
		// Clear any pending update
		if (this.tabHeaderUpdateTimeout) {
			clearTimeout(this.tabHeaderUpdateTimeout);
			this.tabHeaderUpdateTimeout = null;
		}

		// Execute immediately - no debounce to prevent flash
		this._doUpdateTabHeaders();
	}

	/**
	 * Internal method that actually updates the tab headers
	 */
	private _doUpdateTabHeaders(): void {
		// Only hide ghost tab if BOTH sticky icon AND hide tab header are enabled
		if (!this.plugin.settings.showStickyHomeIcon || !this.plugin.settings.hideHomeTabHeader) {
			// Remove all home base tab classes from ALL windows
			this.plugin.app.workspace.iterateAllLeaves((leaf) => {
				const tabHeader = this.getTabHeaderForLeaf(leaf);
				if (tabHeader) {
					tabHeader.classList.remove('is-home-base-tab');
					tabHeader.removeAttribute('data-home-base-ghost');
					tabHeader.removeAttribute('aria-hidden');

					const tabHeaderExtended = tabHeader as TabHeaderElement;
					if (tabHeaderExtended._homeBaseParent && !tabHeaderExtended._homeBaseParent.contains(tabHeader)) {
						const parent = tabHeaderExtended._homeBaseParent;
						const nextSibling = tabHeaderExtended._homeBaseNextSibling;
						if (parent) {
							if (nextSibling && nextSibling.parentElement === parent) {
								parent.insertBefore(tabHeader, nextSibling);
							} else {
								parent.appendChild(tabHeader);
							}
						}
						delete tabHeaderExtended._homeBaseParent;
						delete tabHeaderExtended._homeBaseNextSibling;
					}
				}
			});
			return;
		}

		// CRITICAL: Remove ghost tab headers SYNCHRONOUSLY before any animation frames
		// This prevents them from briefly appearing when tabs change
		const ghostTabHeadersToRemove: Array<{ tabHeader: HTMLElement; leaf: WorkspaceLeaf }> = [];

		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			// Only process leaves in the main workspace (not sidebars)
			const view = leaf.view;
			let container: HTMLElement | null = null;

			if (view) {
				const viewAny = view as unknown as { containerEl?: HTMLElement };
				container = viewAny.containerEl || null;
			}

			if (!container) {
				const leafAny = leaf as unknown as { containerEl?: HTMLElement };
				container = leafAny.containerEl || null;
			}

			if (container) {
				// Check if it's in the main workspace (root, not sidebar)
				const rootWorkspace = container.closest('.workspace-split.mod-vertical.mod-root');
				const leftSidebar = container.closest('.workspace-split.mod-left-split');
				const rightSidebar = container.closest('.workspace-split.mod-right-split');

				// Only process main workspace leaves
				if (rootWorkspace && !leftSidebar && !rightSidebar) {
					if (this.plugin.homeService.isGhostLeaf(leaf)) {
						const tabHeader = this.getTabHeaderForLeaf(leaf);
						if (tabHeader && tabHeader.parentElement) {
							ghostTabHeadersToRemove.push({ tabHeader, leaf });
						}
					}
				}
			}
		});

		// Remove all ghost tab headers synchronously BEFORE any rendering
		ghostTabHeadersToRemove.forEach(({ tabHeader }) => {
			const parent = tabHeader.parentElement;
			if (parent && parent.classList.contains('workspace-tab-header-container-inner')) {
				const tabHeaderExtended = tabHeader as TabHeaderElement;
				// Only remove if not already removed
				if (parent.contains(tabHeader)) {
					tabHeaderExtended._homeBaseParent = parent;
					tabHeaderExtended._homeBaseNextSibling = tabHeader.nextSibling;
					tabHeader.remove();
				}
			}
		});

		// Now update other tab headers in requestAnimationFrame (non-critical)
		requestAnimationFrame(() => {
			const homeBaseSettings = this.plugin.getHomeBaseSettings();
			const homeBasePath = resolvePathSync(homeBaseSettings.type, homeBaseSettings.value, this.plugin.app);

			// Restore any non-ghost tabs that were incorrectly removed
			this.plugin.app.workspace.iterateAllLeaves((leaf) => {
				// Only process leaves in the main workspace (not sidebars)
				const view = leaf.view;
				let container: HTMLElement | null = null;

				if (view) {
					const viewAny = view as unknown as { containerEl?: HTMLElement };
					container = viewAny.containerEl || null;
				}

				if (!container) {
					const leafAny = leaf as unknown as { containerEl?: HTMLElement };
					container = leafAny.containerEl || null;
				}

				if (container) {
					// Check if it's in the main workspace (root, not sidebar)
					const rootWorkspace = container.closest('.workspace-split.mod-vertical.mod-root');
					const leftSidebar = container.closest('.workspace-split.mod-left-split');
					const rightSidebar = container.closest('.workspace-split.mod-right-split');

					// Only process main workspace leaves
					if (rootWorkspace && !leftSidebar && !rightSidebar) {
						const isGhostTab = this.plugin.homeService.isGhostLeaf(leaf);
						const tabHeader = this.getTabHeaderForLeaf(leaf);
						if (!tabHeader) return;

						const tabHeaderExtended = tabHeader as TabHeaderElement;
						const isRemoved = tabHeaderExtended._homeBaseParent && !tabHeaderExtended._homeBaseParent.contains(tabHeader);

						if (!isGhostTab) {
							// Not a ghost tab - restore if it was removed
							if (isRemoved) {
								const parent = tabHeaderExtended._homeBaseParent;
								const nextSibling = tabHeaderExtended._homeBaseNextSibling;
								if (parent) {
									if (nextSibling && nextSibling.parentElement === parent) {
										parent.insertBefore(tabHeader, nextSibling);
									} else {
										parent.appendChild(tabHeader);
									}
									delete tabHeaderExtended._homeBaseParent;
									delete tabHeaderExtended._homeBaseNextSibling;
								}
							}

							// Check if this is a normal home base tab (not ghost) to apply active state styling if needed
							// We only do this if we have a path to compare against (or if it's a graph view)
							const isGraphHome = homeBaseSettings.type === HomeBaseType.Graph && leaf.view?.getViewType() === 'graph';
							if ((homeBasePath && leafHasFile(leaf, homeBasePath)) || isGraphHome) {
								tabHeader.classList.add('is-home-base-tab');
							} else {
								tabHeader.classList.remove('is-home-base-tab');
							}

							tabHeader.removeAttribute('data-home-base-ghost');
							tabHeader.removeAttribute('aria-hidden');
						}
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

		// Fallback: find by querying DOM within the leaf's window
		const viewType = leaf.view?.getViewType();
		if (!viewType) return null;

		// Get the document for this leaf
		const doc = leaf.view?.containerEl?.ownerDocument || document;

		// Get the active leaf to help with matching
		const activeLeaf = this.plugin.app.workspace.getMostRecentLeaf();
		const isActive = leaf === activeLeaf;

		// Find all tab headers with matching view type in THIS window
		const tabHeaders = doc.querySelectorAll(`.workspace-tab-header[data-type="${viewType}"]`);

		// If this is the active leaf, prefer the active tab header in THIS window
		if (isActive) {
			const activeHeader = doc.querySelector('.workspace-tab-header.is-active');
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

		// If only one tab header matches the view type in this window, it's likely the one
		if (tabHeaders.length === 1) {
			return tabHeaders[0] as HTMLElement;
		}

		// Last resort: if this is active and we found an active header in this window, use it
		if (isActive) {
			const activeHeader = doc.querySelector('.workspace-tab-header.is-active');
			if (activeHeader) {
				return activeHeader as HTMLElement;
			}
		}

		return null;
	}

	/**
	 * Close the home base tab
	 * When called from context menu: Only closes the ghost tab (the "occupied" slot)
	 * Other home base tabs are left alone
	 */
	closeHomeBase(actuallyClose: boolean = false): void {
		const homeBaseSettings = this.plugin.getHomeBaseSettings();
		const homeBasePath = resolvePathSync(homeBaseSettings.type, homeBaseSettings.value, this.plugin.app);

		// Find the ghost tab (the "occupied" slot - pinned home base tab)
		const ghostTabs: WorkspaceLeaf[] = [];
		const allHomeBaseLeaves: WorkspaceLeaf[] = [];

		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const isGhost = this.plugin.homeService.isGhostLeaf(leaf);
			if (isGhost) {
				ghostTabs.push(leaf);
			}

			if (homeBasePath && leafHasFile(leaf, homeBasePath)) {
				allHomeBaseLeaves.push(leaf);
			}
		});

		if (this.plugin.settings.showStickyHomeIcon) {
			// Sticky icon enabled: only close the ghost tab(s)
			for (const ghostTab of ghostTabs) {
				void ghostTab.detach();
			}
		} else {
			// Sticky icon disabled: close all home base tabs
			for (const leaf of allHomeBaseLeaves) {
				void leaf.detach();
			}
		}

		// Update tab headers after closing
		this.updateTabHeaders();
	}

	/**
	 * Pin the home base tab
	 */
	pinHomeBaseTab(): void {
		const homeBaseSettings = this.plugin.getHomeBaseSettings();
		const homeBasePath = resolvePathSync(homeBaseSettings.type, homeBaseSettings.value, this.plugin.app);
		if (!homeBasePath) return;

		const homeBaseFile = getFileByPath(this.plugin.app, homeBasePath);
		if (!homeBaseFile) return;

		const homeBaseLeaf = this.plugin.homeService.findExistingHomeBaseLeaf(homeBaseFile);
		if (homeBaseLeaf) {
			homeBaseLeaf.setPinned(true);
		}
	}

	/**
	 * Unpin the home base tab
	 */
	unpinHomeBaseTab(): void {
		const homeBaseSettings = this.plugin.getHomeBaseSettings();
		const homeBasePath = resolvePathSync(homeBaseSettings.type, homeBaseSettings.value, this.plugin.app);
		if (!homeBasePath) return;

		const homeBaseFile = getFileByPath(this.plugin.app, homeBasePath);
		if (!homeBaseFile) return;

		const homeBaseLeaf = this.plugin.homeService.findExistingHomeBaseLeaf(homeBaseFile);
		if (homeBaseLeaf) {
			homeBaseLeaf.setPinned(false);
		}
	}

	/**
	 * Check if the home base tab is pinned
	 */
	isHomeBaseTabPinned(): boolean {
		const homeBaseSettings = this.plugin.getHomeBaseSettings();
		const homeBasePath = resolvePathSync(homeBaseSettings.type, homeBaseSettings.value, this.plugin.app);
		if (!homeBasePath) return false;

		const homeBaseFile = getFileByPath(this.plugin.app, homeBasePath);
		if (!homeBaseFile) return false;

		const homeBaseLeaf = this.plugin.homeService.findExistingHomeBaseLeaf(homeBaseFile);
		if (!homeBaseLeaf) return false;

		const viewState = homeBaseLeaf.getViewState();
		return viewState.pinned === true;
	}
}
