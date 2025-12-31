/**
 * Home Base Settings Tab
 */

import { App, PluginSettingTab } from 'obsidian';
import type HomeBasePlugin from '../main';
import { VIEW_MODE_OPTIONS, NEW_TAB_MODE_OPTIONS, ViewMode, NewTabMode } from '../settings';
import { createSettingsGroup } from '../utils/settings-compat';
import { FilePathSuggest } from './file-suggest';
import { CommandSuggest, getCommandById } from './command-suggest';

export class HomeBaseSettingTab extends PluginSettingTab {
	plugin: HomeBasePlugin;

	constructor(app: App, plugin: HomeBasePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// General Settings (no heading for first group)
		const generalGroup = createSettingsGroup(containerEl);

		generalGroup.addSetting((setting) => {
			setting
				.setName('Home base file')
				.setDesc('The file to open as your home base (supports .md, .mdx, .canvas, .base)')
				.addText((text) => {
					// Add file suggester
					new FilePathSuggest(this.app, text.inputEl);
					
					text
						.setPlaceholder('Path to home base file')
						.setValue(this.plugin.settings.homeBasePath)
						.onChange(async (value) => {
							this.plugin.settings.homeBasePath = value;
							await this.plugin.saveSettings();
						});
				});
		});

		generalGroup.addSetting((setting) => {
			setting
				.setName('Open on startup')
				.setDesc('Open the home base when launching Obsidian')
				.addToggle((toggle) => {
					toggle
						.setValue(this.plugin.settings.openOnStartup)
						.onChange(async (value) => {
							this.plugin.settings.openOnStartup = value;
							await this.plugin.saveSettings();
						});
				});
		});

		generalGroup.addSetting((setting) => {
			setting
				.setName('View mode')
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setDesc('How to open markdown and MDX files (canvas/base use native views)')
				.addDropdown((dropdown) => {
					for (const [value, label] of Object.entries(VIEW_MODE_OPTIONS)) {
						dropdown.addOption(value, label);
					}
					dropdown
						.setValue(this.plugin.settings.openViewMode)
						.onChange(async (value) => {
							this.plugin.settings.openViewMode = value as ViewMode;
							await this.plugin.saveSettings();
						});
				});
		});

		// Tab Behavior Settings
		const tabGroup = createSettingsGroup(containerEl, 'Tab Behavior');

		tabGroup.addSetting((setting) => {
			setting
				.setName('Replace new tabs')
				.setDesc('Open home base instead of new empty tabs')
				.addToggle((toggle) => {
					toggle
						.setValue(this.plugin.settings.replaceNewTab)
						.onChange(async (value) => {
							this.plugin.settings.replaceNewTab = value;
							await this.plugin.saveSettings();
							
							// Preserve scroll position before re-rendering
							const scrollContainer = containerEl.closest('.vertical-tab-content') || 
													containerEl.closest('.settings-content') || 
													containerEl.parentElement;
							const scrollTop = scrollContainer?.scrollTop || 0;
							
							this.display(); // Re-render to show/hide dependent setting
							
							// Restore scroll position after rendering
							requestAnimationFrame(() => {
								if (scrollContainer) {
									scrollContainer.scrollTop = scrollTop;
								}
							});
						});
				});
		});

		// Only show new tab mode if replace new tab is enabled
		if (this.plugin.settings.replaceNewTab) {
			tabGroup.addSetting((setting) => {
				setting
					.setName('New tab replacement mode')
					.setDesc('When to replace new tabs with home base')
					.addDropdown((dropdown) => {
						for (const [value, label] of Object.entries(NEW_TAB_MODE_OPTIONS)) {
							dropdown.addOption(value, label);
						}
						dropdown
							.setValue(this.plugin.settings.newTabMode)
							.onChange(async (value) => {
								this.plugin.settings.newTabMode = value as NewTabMode;
								await this.plugin.saveSettings();
							});
					});
			});
		}

		tabGroup.addSetting((setting) => {
			setting
				.setName('Keep existing tabs')
				.setDesc('When opening home base on startup, keep existing tabs open')
				.addToggle((toggle) => {
					toggle
						.setValue(this.plugin.settings.keepExistingTabs)
						.onChange(async (value) => {
							this.plugin.settings.keepExistingTabs = value;
							await this.plugin.saveSettings();
						});
				});
		});

		// UI Features Settings
		const uiGroup = createSettingsGroup(containerEl, 'UI Features');

		uiGroup.addSetting((setting) => {
			setting
				.setName('Sticky home icon')
				.setDesc('Show a home icon in the tab bar that stays pinned to the left (desktop only)')
				.addToggle((toggle) => {
					toggle
						.setValue(this.plugin.settings.showStickyHomeIcon)
						.onChange(async (value) => {
							this.plugin.settings.showStickyHomeIcon = value;
							await this.plugin.saveSettings();
							this.plugin.updateStickyTabIcon();
							
							// Preserve scroll position before re-rendering
							const scrollContainer = containerEl.closest('.vertical-tab-content') || 
													containerEl.closest('.settings-content') || 
													containerEl.parentElement;
							const scrollTop = scrollContainer?.scrollTop || 0;
							
							this.display(); // Re-render to show/hide dependent setting
							
							// Restore scroll position after rendering
							requestAnimationFrame(() => {
								if (scrollContainer) {
									scrollContainer.scrollTop = scrollTop;
								}
							});
						});
				});
		});

		// Only show replace tab option if sticky icon is enabled
		if (this.plugin.settings.showStickyHomeIcon) {
			uiGroup.addSetting((setting) => {
				setting
					.setName('Replace current tab')
					.setDesc('When clicking the sticky home icon, replace the current tab instead of opening a new one')
					.addToggle((toggle) => {
						toggle
							.setValue(this.plugin.settings.stickyIconReplaceTab)
							.onChange(async (value) => {
								this.plugin.settings.stickyIconReplaceTab = value;
								await this.plugin.saveSettings();
							});
					});
			});

			uiGroup.addSetting((setting) => {
				setting
					.setName('Hide tab header')
					.setDesc('Hide the home base tab header when it\'s open, using the sticky icon as the tab indicator')
					.addToggle((toggle) => {
						toggle
							.setValue(this.plugin.settings.hideHomeTabHeader)
							.onChange(async (value) => {
								this.plugin.settings.hideHomeTabHeader = value;
								await this.plugin.saveSettings();
								this.plugin.stickyTabService.updateTabHeaders();
							});
					});
			});
		}

		uiGroup.addSetting((setting) => {
			setting
				.setName('Replace mobile new tab button')
				.setDesc('Change the mobile new tab button to a home icon')
				.addToggle((toggle) => {
					toggle
						.setValue(this.plugin.settings.replaceMobileNewTab)
						.onChange(async (value) => {
							this.plugin.settings.replaceMobileNewTab = value;
							await this.plugin.saveSettings();
							this.plugin.updateMobileButton();
						});
				});
		});

		// Automation Settings
		const automationGroup = createSettingsGroup(containerEl, 'Automation');

		automationGroup.addSetting((setting) => {
			const commandId = this.plugin.settings.commandOnOpen;
			const command = commandId ? getCommandById(this.app, commandId) : undefined;
			const displayValue = command ? command.name : commandId;

			setting
				.setName('Command on open')
				.setDesc('Run an Obsidian command when opening home base')
				.addText((text) => {
					// Add command suggester
					new CommandSuggest(this.app, text.inputEl);
					
					text
						.setPlaceholder('Search for a command...')
						.setValue(displayValue || '')
						.onChange(async (value) => {
							this.plugin.settings.commandOnOpen = value;
							await this.plugin.saveSettings();
						});
				})
				.addExtraButton((btn) => {
					btn
						.setIcon('x')
						.setTooltip('Clear command')
						.onClick(async () => {
							this.plugin.settings.commandOnOpen = '';
							await this.plugin.saveSettings();
							
							// Preserve scroll position before re-rendering
							const scrollContainer = containerEl.closest('.vertical-tab-content') || 
													containerEl.closest('.settings-content') || 
													containerEl.parentElement;
							const scrollTop = scrollContainer?.scrollTop || 0;
							
							this.display();
							
							// Restore scroll position after rendering
							requestAnimationFrame(() => {
								if (scrollContainer) {
									scrollContainer.scrollTop = scrollTop;
								}
							});
						});
				});
		});
	}
}
