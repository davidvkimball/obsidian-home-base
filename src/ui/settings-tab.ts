/**
 * Home Base Settings Tab
 */

import { App, PluginSettingTab } from 'obsidian';
import type HomeBasePlugin from '../main';
import { 
	VIEW_MODE_OPTIONS, 
	NEW_TAB_MODE_OPTIONS, 
	OPENING_MODE_OPTIONS,
	ViewMode, 
	NewTabMode,
	OpeningMode,
	HomeBaseType,
	UNCHANGEABLE_TYPES,
} from '../settings';
import { createSettingsGroup } from '../utils/settings-compat';
import { FilePathSuggest, FolderSuggest, WorkspaceSuggest } from './file-suggest';
import { CommandSuggest, getCommandById } from './command-suggest';
import { IconPicker } from './icon-picker';

export class HomeBaseSettingTab extends PluginSettingTab {
	plugin: HomeBasePlugin;

	constructor(app: App, plugin: HomeBasePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Get active settings (mobile or desktop)
		const isMobile = this.plugin.settings.separateMobile;
		const activeType = isMobile ? this.plugin.settings.mobileHomeBaseType : this.plugin.settings.homeBaseType;
		const activeValue = isMobile ? this.plugin.settings.mobileHomeBaseValue : this.plugin.settings.homeBaseValue;

		// General Settings (no heading for first group)
		const generalGroup = createSettingsGroup(containerEl);

		// Home page type dropdown
		generalGroup.addSetting((setting) => {
			setting
				.setName('Home page')
				.setDesc('What to open as your home base')
				.addDropdown((dropdown) => {
					let pluginDisabled = false;
					
					for (const type of Object.values(HomeBaseType)) {
						if (!this.plugin.hasRequiredPlugin(type)) {
							// If current type is disabled, mark it but still allow it
							if (type === activeType) {
								pluginDisabled = true;
								dropdown.addOption(type, type);
							} else {
								// Add disabled option
								dropdown.selectEl.createEl('option', { 
									text: type, 
									attr: { disabled: 'true' } 
								});
								continue;
							}
						} else {
							dropdown.addOption(type, type);
						}
					}
					
					dropdown
						.setValue(activeType || HomeBaseType.File)
						.onChange(async (value) => {
							if (isMobile) {
								this.plugin.settings.mobileHomeBaseType = value as HomeBaseType;
							} else {
								this.plugin.settings.homeBaseType = value as HomeBaseType;
							}
							await this.plugin.saveSettings();
							
							// Re-render to show/hide value input
							const scrollContainer = containerEl.closest('.vertical-tab-content') || 
													containerEl.closest('.settings-content') || 
													containerEl.parentElement;
							const scrollTop = scrollContainer?.scrollTop || 0;
							this.display();
							requestAnimationFrame(() => {
								if (scrollContainer) {
									scrollContainer.scrollTop = scrollTop;
								}
							});
						});
					
					// Show warning if current type requires a disabled plugin
					if (pluginDisabled) {
						setting.descEl.createDiv({
							text: 'The plugin required for this home page type isn\'t available.',
							cls: 'mod-warning'
						});
					}
				});
		});

		// Value input (conditional on type)
		if (!UNCHANGEABLE_TYPES.includes(activeType)) {
			generalGroup.addSetting((setting) => {
				let desc = '';
				let placeholder = '';

				if (activeType === HomeBaseType.File) {
					desc = 'The file to open as your home base (supports .md, .mdx, .canvas, .base)';
					placeholder = 'Path to home base file';
				} else if (activeType === HomeBaseType.Workspace) {
					desc = 'The workspace to load as your home base';
					placeholder = 'Workspace name';
				} else if (activeType === HomeBaseType.RandomFolder) {
					desc = 'The folder to pick a random file from';
					placeholder = 'Folder path';
				} else if (activeType === HomeBaseType.Journal) {
					desc = 'The journal name';
					placeholder = 'Journal name';
				}

				setting
					.setName(activeType === HomeBaseType.File ? 'File' : 
							activeType === HomeBaseType.Workspace ? 'Workspace' :
							activeType === HomeBaseType.RandomFolder ? 'Folder' :
							activeType === HomeBaseType.Journal ? 'Journal' : 'Value')
					.setDesc(desc)
					.addText((text) => {
						// Add appropriate suggester
						if (activeType === HomeBaseType.File) {
							new FilePathSuggest(this.app, text.inputEl);
						} else if (activeType === HomeBaseType.Workspace) {
							new WorkspaceSuggest(this.app, text.inputEl);
						} else if (activeType === HomeBaseType.RandomFolder) {
							new FolderSuggest(this.app, text.inputEl);
						}
						
						text
							.setPlaceholder(placeholder)
							.setValue(activeValue || '')
							.onChange(async (value) => {
								if (isMobile) {
									this.plugin.settings.mobileHomeBaseValue = value;
									// Also update legacy path for compatibility
									if (activeType === HomeBaseType.File) {
										this.plugin.settings.mobileHomeBasePath = value;
									}
								} else {
									this.plugin.settings.homeBaseValue = value;
									// Also update legacy path for compatibility
									if (activeType === HomeBaseType.File) {
										this.plugin.settings.homeBasePath = value;
									}
								}
								await this.plugin.saveSettings();
							});
					});
			});
		}

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

		// "Open when empty" setting removed - redundant with "New tab replacement: only when empty"
		// Since Obsidian auto-creates an empty tab when you close the last one, they do the same thing

		generalGroup.addSetting((setting) => {
			setting
				.setName('Opening mode (startup)')
				.setDesc('How to handle existing tabs when opening on startup')
				.addDropdown((dropdown) => {
					for (const [value, label] of Object.entries(OPENING_MODE_OPTIONS)) {
						dropdown.addOption(value, label);
					}
					dropdown
						.setValue(this.plugin.settings.openMode)
						.onChange(async (value) => {
							this.plugin.settings.openMode = value as OpeningMode;
							await this.plugin.saveSettings();
						});
				});
		});

		generalGroup.addSetting((setting) => {
			setting
				.setName('Opening mode (manual)')
				.setDesc('How to handle existing tabs when opening manually')
				.addDropdown((dropdown) => {
					for (const [value, label] of Object.entries(OPENING_MODE_OPTIONS)) {
						dropdown.addOption(value, label);
					}
					dropdown
						.setValue(this.plugin.settings.manualOpenMode)
						.onChange(async (value) => {
							this.plugin.settings.manualOpenMode = value as OpeningMode;
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

		generalGroup.addSetting((setting) => {
			setting
				.setName('Revert view on close')
				.setDesc('When navigating away from the home base, restore the default view')
				.addToggle((toggle) => {
					toggle
						.setValue(this.plugin.settings.revertView)
						.onChange(async (value) => {
							this.plugin.settings.revertView = value;
							await this.plugin.saveSettings();
						});
				});
		});

		generalGroup.addSetting((setting) => {
			setting
				.setName('Auto-scroll')
				.setDesc('When opening the home base, scroll to the bottom and focus on the last line')
				.addToggle((toggle) => {
					toggle
						.setValue(this.plugin.settings.autoScroll)
						.onChange(async (value) => {
							this.plugin.settings.autoScroll = value;
							await this.plugin.saveSettings();
						});
				});
		});

		generalGroup.addSetting((setting) => {
			setting
				.setName('Hide release notes')
				.setDesc('Never display release notes when Obsidian updates')
				.addToggle((toggle) => {
					toggle
						.setValue(this.plugin.settings.hideReleaseNotes)
						.onChange(async (value) => {
							this.plugin.settings.hideReleaseNotes = value;
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

		// Legacy "Keep existing tabs" - kept for backward compatibility but hidden
		// (functionality now handled by "Opening mode (startup)")

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

		// Only show sticky icon settings if sticky icon is enabled
		if (this.plugin.settings.showStickyHomeIcon) {
			uiGroup.addSetting((setting) => {
				setting
					.setName('Icon')
					.setDesc('The icon to display in the sticky home icon')
					.addButton((button) => {
						const iconName = this.plugin.settings.stickyIconName || 'home';
						button
							.setButtonText('Change icon')
							.setIcon(iconName)
							.onClick(() => {
								const picker = new IconPicker(
									this.app,
									this.plugin.settings.stickyIconName,
									(icon: string | null) => {
										void (async () => {
											this.plugin.settings.stickyIconName = icon;
											await this.plugin.saveSettings();
											// Update the icon display
											this.plugin.stickyTabService.update();
											// Re-render settings to update button icon
											this.display();
										})();
									}
								);
								picker.open();
							});
					});
			});

			uiGroup.addSetting((setting) => {
				setting
					.setName('Hide tab header')
					.setDesc('Hide the ghost tab header when it\'s open, using the sticky icon as the tab indicator')
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

		// Mobile Settings
		const mobileGroup = createSettingsGroup(containerEl, 'Mobile');

		mobileGroup.addSetting((setting) => {
				setting
					.setName('Separate mobile home page')
					.setDesc('Use a different home page on mobile devices')
				.addToggle((toggle) => {
					toggle
						.setValue(this.plugin.settings.separateMobile)
						.onChange(async (value) => {
							this.plugin.settings.separateMobile = value;
							await this.plugin.saveSettings();
							
							// Re-render to show mobile settings
							const scrollContainer = containerEl.closest('.vertical-tab-content') || 
													containerEl.closest('.settings-content') || 
													containerEl.parentElement;
							const scrollTop = scrollContainer?.scrollTop || 0;
							this.display();
							requestAnimationFrame(() => {
								if (scrollContainer) {
									scrollContainer.scrollTop = scrollTop;
								}
							});
						});
				});
		});

		// Show mobile-specific settings if separate mobile is enabled
		if (this.plugin.settings.separateMobile) {
			mobileGroup.addSetting((setting) => {
				setting
					.setName('Mobile home page')
					.setDesc('What to open as your home base on mobile')
					.addDropdown((dropdown) => {
						const mobileType = this.plugin.settings.mobileHomeBaseType || HomeBaseType.File;
						let pluginDisabled = false;
						
						for (const type of Object.values(HomeBaseType)) {
							if (!this.plugin.hasRequiredPlugin(type)) {
								// If current type is disabled, mark it but still allow it
								if (type === mobileType) {
									pluginDisabled = true;
									dropdown.addOption(type, type);
								} else {
									// Add disabled option
									dropdown.selectEl.createEl('option', { 
										text: type, 
										attr: { disabled: 'true' } 
									});
									continue;
								}
							} else {
								dropdown.addOption(type, type);
							}
						}
						
						dropdown
							.setValue(mobileType)
							.onChange(async (value) => {
								this.plugin.settings.mobileHomeBaseType = value as HomeBaseType;
								await this.plugin.saveSettings();
								
								const scrollContainer = containerEl.closest('.vertical-tab-content') || 
														containerEl.closest('.settings-content') || 
														containerEl.parentElement;
								const scrollTop = scrollContainer?.scrollTop || 0;
								this.display();
								requestAnimationFrame(() => {
									if (scrollContainer) {
										scrollContainer.scrollTop = scrollTop;
									}
								});
							});
						
						// Show warning if current type requires a disabled plugin
						if (pluginDisabled) {
							setting.descEl.createDiv({
								text: 'The plugin required for this home page type isn\'t available.',
								cls: 'mod-warning'
							});
						}
					});
			});

			if (!UNCHANGEABLE_TYPES.includes(this.plugin.settings.mobileHomeBaseType)) {
				mobileGroup.addSetting((setting) => {
					const mobileType = this.plugin.settings.mobileHomeBaseType;
					let desc = '';
					let placeholder = '';

					if (mobileType === HomeBaseType.File) {
						desc = 'The file to open as your home base on mobile';
						placeholder = 'Path to home base file';
					} else if (mobileType === HomeBaseType.Workspace) {
						desc = 'The workspace to load as your home base on mobile';
						placeholder = 'Workspace name';
					} else if (mobileType === HomeBaseType.RandomFolder) {
						desc = 'The folder to pick a random file from on mobile';
						placeholder = 'Folder path';
					} else if (mobileType === HomeBaseType.Journal) {
						desc = 'The journal name for mobile';
						placeholder = 'Journal name';
					}

					setting
						.setName(mobileType === HomeBaseType.File ? 'Mobile file' : 
								mobileType === HomeBaseType.Workspace ? 'Mobile workspace' :
								mobileType === HomeBaseType.RandomFolder ? 'Mobile folder' :
								mobileType === HomeBaseType.Journal ? 'Mobile journal' : 'Mobile value')
						.setDesc(desc)
						.addText((text) => {
							if (mobileType === HomeBaseType.File) {
								new FilePathSuggest(this.app, text.inputEl);
							} else if (mobileType === HomeBaseType.Workspace) {
								new WorkspaceSuggest(this.app, text.inputEl);
							} else if (mobileType === HomeBaseType.RandomFolder) {
								new FolderSuggest(this.app, text.inputEl);
							}
							
							text
								.setPlaceholder(placeholder)
								.setValue(this.plugin.settings.mobileHomeBaseValue || '')
								.onChange(async (value) => {
									this.plugin.settings.mobileHomeBaseValue = value;
									if (mobileType === HomeBaseType.File) {
										this.plugin.settings.mobileHomeBasePath = value;
									}
									await this.plugin.saveSettings();
								});
						});
				});
			}
		}

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
