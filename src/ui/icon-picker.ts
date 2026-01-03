/**
 * Icon Picker Modal
 * Simplified icon picker for selecting sticky icon
 * Based on iconic plugin's icon picker
 */

import { App, ButtonComponent, Modal, Platform, Setting, TextComponent, prepareFuzzySearch, setIcon, getIconIds } from 'obsidian';

export interface IconPickerCallback {
	(icon: string | null): void;
}

/**
 * Simplified icon picker modal
 */
export class IconPicker extends Modal {
	private selectedIcon: string | null;
	private callback: IconPickerCallback;
	private searchField: TextComponent;
	private searchResults: [icon: string, iconName: string][] = [];
	private searchResultsSetting: Setting;

	constructor(app: App, currentIcon: string | null, callback: IconPickerCallback) {
		super(app);
		this.selectedIcon = currentIcon;
		this.callback = callback;
	}

	onOpen(): void {
		this.containerEl.addClass('mod-confirmation');
		this.modalEl.addClass('iconic-icon-picker');
		this.setTitle('Change icon');

		// Search field
		const searchSetting = new Setting(this.contentEl);
		if (!Platform.isPhone) {
			searchSetting.setName('Search');
		}
		searchSetting.addSearch((searchField) => {
			searchField
				.setPlaceholder('Search icons...')
				.onChange(() => this.updateSearchResults());
			searchField.inputEl.enterKeyHint = 'go';
			this.searchField = searchField;
		});
		if (this.selectedIcon) {
			this.searchField.setValue(this.selectedIcon);
		}

		// Search results
		this.searchResultsSetting = new Setting(this.contentEl);
		this.searchResultsSetting.settingEl.addClass('iconic-search-results');
		this.searchResultsSetting.settingEl.tabIndex = 0;
		
		// Allow vertical scrolling to work horizontally
		this.searchResultsSetting.settingEl.addEventListener('wheel', (event) => {
			if (document.body.hasClass('mod-rtl')) {
				this.searchResultsSetting.settingEl.scrollLeft -= event.deltaY;
			} else {
				this.searchResultsSetting.settingEl.scrollLeft += event.deltaY;
			}
		}, { passive: true });

		// Buttons - match iconic's button layout
		const buttonContainer = this.modalEl.createDiv({ cls: 'modal-button-container' });

		// Cancel
		new ButtonComponent(buttonContainer)
			.setButtonText('Cancel')
			.onClick(() => this.close())
			.buttonEl.addClass('mod-cancel');

		// Save
		new ButtonComponent(buttonContainer)
			.setButtonText('Save')
			.setCta()
			.onClick(() => {
				this.callback(this.selectedIcon);
				this.close();
			});

		// Auto-focus search field
		requestAnimationFrame(() => {
			this.searchField.inputEl.select();
			this.updateSearchResults();
		});
	}

	/**
	 * Update search results based on current query
	 */
	private updateSearchResults(): void {
		const query = this.searchField.getValue().toLowerCase().trim();
		const fuzzySearch = prepareFuzzySearch(query);
		const matches: [score: number, iconEntry: [string, string]][] = [];

		// Get all available icons
		const iconIds = getIconIds();

		// Search icons
		if (query) {
			for (const iconId of iconIds) {
				// Create a readable name from icon ID
				const iconName = this.formatIconName(iconId);
				
				if (iconId === query || iconId.toLowerCase() === query) {
					matches.push([0, [iconId, iconName]]);
				} else {
					const fuzzyMatch = fuzzySearch(iconName);
					if (fuzzyMatch) {
						matches.push([fuzzyMatch.score, [iconId, iconName]]);
					}
				}
			}
		} else {
			// Show all icons if no query
			for (const iconId of iconIds) {
				const iconName = this.formatIconName(iconId);
				matches.push([0, [iconId, iconName]]);
			}
		}

		// Sort by score
		matches.sort(([scoreA], [scoreB]) => scoreA > scoreB ? -1 : +1);

		// Limit results
		this.searchResults.length = 0;
		const maxResults = 100;
		for (const [, iconEntry] of matches) {
			this.searchResults.push(iconEntry);
			if (this.searchResults.length >= maxResults) break;
		}

		// Update UI - use ExtraButtonComponent like iconic
		this.searchResultsSetting.clear();
		for (const [iconId, iconName] of this.searchResults) {
			this.searchResultsSetting.addExtraButton((iconButton) => {
				iconButton.setTooltip(iconName, {
					delay: 300,
					placement: Platform.isPhone ? 'top' : 'bottom',
				});
				const iconEl = iconButton.extraSettingsEl;
				iconEl.addClass('iconic-search-result');
				iconEl.tabIndex = -1;

				setIcon(iconEl, iconId);

				// Highlight selected icon
				if (iconId === this.selectedIcon) {
					iconEl.addClass('is-selected');
				}

				iconEl.addEventListener('click', () => {
					this.selectedIcon = iconId;
					this.callback(iconId);
					this.close();
				});

				// Mobile: show tooltip on long press
				if (Platform.isPhone) {
					iconEl.addEventListener('contextmenu', () => {
						navigator.vibrate?.(100);
						// Tooltip is already set above
					});
				}
			});
		}

		// Use an invisible button to preserve height if no results
		if (this.searchResults.length === 0) {
			this.searchResultsSetting.addExtraButton((button) => {
				button.extraSettingsEl.addClasses(['iconic-invisible', 'iconic-search-result']);
			});
		}
	}

	/**
	 * Format icon ID into readable name
	 */
	private formatIconName(iconId: string): string {
		// Remove lucide- prefix if present
		let name = iconId.replace(/^lucide-/, '');
		// Replace dashes with spaces
		name = name.replace(/-/g, ' ');
		// Capitalize first letter of each word
		return name.split(' ').map(word => 
			word.charAt(0).toUpperCase() + word.slice(1)
		).join(' ');
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
