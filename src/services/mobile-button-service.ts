/**
 * Mobile Button Service
 * Manages the mobile new tab button replacement
 */

import { Platform } from 'obsidian';
import type HomeBasePlugin from '../main';

/**
 * CSS class for when mobile button is replaced
 */
const MOBILE_HOME_CLASS = 'home-base-mobile-enabled';

export class MobileButtonService {
	private plugin: HomeBasePlugin;

	constructor(plugin: HomeBasePlugin) {
		this.plugin = plugin;
	}

	// The main app window's document. Obsidian 1.13.0+ opens Settings in a
	// separate window, so `activeDocument` (the focused window) can point at the
	// Settings window while a setting is being changed. This feature is mobile-
	// only (where there is no separate Settings window), but using the main
	// window's document keeps it correct under desktop "emulate mobile" too.
	private get doc(): Document {
		return this.plugin.app.workspace.containerEl.ownerDocument;
	}

	/**
	 * Update the mobile button based on settings
	 */
	update(): void {
		// Only apply on mobile
		if (!Platform.isMobile) {
			this.remove();
			return;
		}

		if (this.plugin.settings.replaceMobileNewTab) {
			this.apply();
		} else {
			this.remove();
		}
	}

	/**
	 * Apply the mobile button replacement
	 */
	private apply(): void {
		this.doc.body.classList.add(MOBILE_HOME_CLASS);
	}

	/**
	 * Remove the mobile button replacement
	 */
	remove(): void {
		this.doc.body.classList.remove(MOBILE_HOME_CLASS);
	}
}
