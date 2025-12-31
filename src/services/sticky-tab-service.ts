/**
 * Sticky Tab Service
 * Manages the sticky home icon in the tab bar
 */

import { Platform, setIcon } from 'obsidian';
import type HomeBasePlugin from '../main';

/**
 * CSS class for the sticky home icon container
 */
const STICKY_ICON_CLASS = 'home-base-sticky-icon';
const STICKY_ICON_ACTIVE_CLASS = 'home-base-sticky-icon-active';

export class StickyTabService {
	private plugin: HomeBasePlugin;
	private stickyIconEl: HTMLElement | null = null;
	private layoutChangeHandler: (() => void) | null = null;

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
			return;
		}

		if (this.plugin.settings.showStickyHomeIcon) {
			this.create();
		} else {
			this.remove();
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
			void this.plugin.homeService.openHomeBase({
				replaceActiveLeaf: this.plugin.settings.stickyIconReplaceTab,
				runCommand: true,
			});
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
		}, 300); // Check every 300ms - frequent enough to catch issues, slow enough to not cause problems

		// Store interval so we can clear it later
		(this.stickyIconEl as any)._checkInterval = checkInterval;

		// Also check on layout changes
		if (!this.layoutChangeHandler) {
			this.layoutChangeHandler = () => {
				if (this.stickyIconEl && this.plugin.settings.showStickyHomeIcon) {
					// Use a small delay to let layout settle
					setTimeout(() => {
						ensureIconInPlace();
					}, 50);
				}
			};

			this.plugin.registerEvent(
				this.plugin.app.workspace.on('layout-change', this.layoutChangeHandler)
			);
		}
	}

	/**
	 * Remove the sticky home icon
	 */
	remove(): void {
		// Clear any check intervals
		if (this.stickyIconEl && (this.stickyIconEl as any)._checkInterval) {
			clearInterval((this.stickyIconEl as any)._checkInterval);
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
			if ((el as any)._checkInterval) {
				clearInterval((el as any)._checkInterval);
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
	}

	/**
	 * Toggle the sticky icon visibility
	 */
	async toggle(): Promise<void> {
		this.plugin.settings.showStickyHomeIcon = !this.plugin.settings.showStickyHomeIcon;
		await this.plugin.saveSettings();
		this.update();
	}
}
