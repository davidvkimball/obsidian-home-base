import { HomeBaseType, DEFAULT_SETTINGS } from './settings';
import type HomeBasePlugin from './main';

/**
 * Migrate legacy settings to new format
 */
export async function migrateLegacySettings(plugin: HomeBasePlugin): Promise<void> {
    let needsSave = false;
    const settings = plugin.settings as unknown as Record<string, string | boolean | HomeBaseType | undefined>;

    // Migrate homeBasePath to homeBaseType/homeBaseValue
    if (settings.homeBasePath && !plugin.settings.homeBaseValue) {
        plugin.settings.homeBaseType = HomeBaseType.File;
        plugin.settings.homeBaseValue = settings.homeBasePath as string;
        needsSave = true;
    }

    // Migrate keepExistingTabs to openMode
    if (settings.keepExistingTabs !== undefined) {
        // Only migrate if openMode is still at default (hasn't been set by user)
        if (plugin.settings.openMode === DEFAULT_SETTINGS.openMode) {
            plugin.settings.openMode = settings.keepExistingTabs ? 'retain' : 'replace-all';
            needsSave = true;
        }
        // Delete legacy property so it doesn't trigger again
        delete settings.keepExistingTabs;
        needsSave = true;
    }

    // Migrate mobile homeBasePath
    if (settings.mobileHomeBasePath && !plugin.settings.mobileHomeBaseValue) {
        plugin.settings.mobileHomeBaseType = HomeBaseType.File;
        plugin.settings.mobileHomeBaseValue = settings.mobileHomeBasePath as string;
        needsSave = true;
    }

    // Also clean up mobile home base path legacy property
    if (settings.mobileHomeBasePath !== undefined) {
        delete settings.mobileHomeBasePath;
        needsSave = true;
    }

    // Clean up legacy homeBasePath if it matches homeBaseValue
    if (settings.homeBasePath !== undefined) {
        delete settings.homeBasePath;
        needsSave = true;
    }

    if (needsSave) {
        await plugin.saveSettings();
    }
}
