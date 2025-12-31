/**
 * File Path Suggester Component
 * Provides autocomplete for file paths in settings
 */

import { AbstractInputSuggest, App, TFile, TFolder } from 'obsidian';

/**
 * Supported file extensions for home base
 */
const SUPPORTED_EXTENSIONS = ['md', 'mdx', 'canvas', 'base'];

/**
 * File path suggester that provides autocomplete for vault files
 */
export class FilePathSuggest extends AbstractInputSuggest<TFile> {
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(query: string): TFile[] {
		const lowerQuery = query.toLowerCase();
		const files: TFile[] = [];

		// Get all files from vault
		this.app.vault.getAllLoadedFiles().forEach((file) => {
			if (file instanceof TFile) {
				// Only include supported file types
				if (SUPPORTED_EXTENSIONS.includes(file.extension)) {
					// Match against path or name
					if (
						file.path.toLowerCase().includes(lowerQuery) ||
						file.basename.toLowerCase().includes(lowerQuery)
					) {
						files.push(file);
					}
				}
			}
		});

		// Sort by relevance (exact matches first, then alphabetically)
		files.sort((a, b) => {
			const aStartsWith = a.path.toLowerCase().startsWith(lowerQuery);
			const bStartsWith = b.path.toLowerCase().startsWith(lowerQuery);
			
			if (aStartsWith && !bStartsWith) return -1;
			if (!aStartsWith && bStartsWith) return 1;
			
			return a.path.localeCompare(b.path);
		});

		// Limit results
		return files.slice(0, 20);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		// Show file name prominently
		el.createEl('div', { 
			text: file.basename,
			cls: 'suggestion-title'
		});
		
		// Show path in smaller text if different from basename
		if (file.parent && file.parent.path !== '/') {
			el.createEl('small', { 
				text: file.parent.path,
				cls: 'suggestion-path'
			});
		}

		// Show file type indicator
		if (file.extension !== 'md') {
			el.createEl('span', {
				text: file.extension.toUpperCase(),
				cls: 'suggestion-flair'
			});
		}
	}

	selectSuggestion(file: TFile): void {
		this.inputEl.value = file.path;
		this.inputEl.trigger('input');
		this.close();
	}
}

/**
 * Folder path suggester for selecting folders
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(query: string): TFolder[] {
		const lowerQuery = query.toLowerCase();
		const folders: TFolder[] = [];

		this.app.vault.getAllLoadedFiles().forEach((file) => {
			if (file instanceof TFolder) {
				if (file.path.toLowerCase().includes(lowerQuery)) {
					folders.push(file);
				}
			}
		});

		folders.sort((a, b) => a.path.localeCompare(b.path));
		return folders.slice(0, 20);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.createEl('div', { text: folder.path || '/' });
	}

	selectSuggestion(folder: TFolder): void {
		this.inputEl.value = folder.path;
		this.inputEl.trigger('input');
		this.close();
	}
}
