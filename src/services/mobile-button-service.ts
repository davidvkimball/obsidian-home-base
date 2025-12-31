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
		document.body.classList.add(MOBILE_HOME_CLASS);
	}

	/**
	 * Remove the mobile button replacement
	 */
	remove(): void {
		document.body.classList.remove(MOBILE_HOME_CLASS);
	}
}
