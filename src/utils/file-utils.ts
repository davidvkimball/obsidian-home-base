/**
 * File Utilities
 * Helper functions for file type detection and handling
 */

import { App, TFile, WorkspaceLeaf } from 'obsidian';

/**
 * Supported file extensions for home base
 */
export const SUPPORTED_EXTENSIONS = ['md', 'mdx', 'canvas', 'base'] as const;
export type SupportedExtension = typeof SUPPORTED_EXTENSIONS[number];

/**
 * View types corresponding to file extensions
 */
export const VIEW_TYPE_MAP: Record<SupportedExtension, string> = {
	'md': 'markdown',
	'mdx': 'markdown',
	'canvas': 'canvas',
	'base': 'bases',
};

/**
 * Check if a file extension is supported
 */
export function isSupportedExtension(extension: string): extension is SupportedExtension {
	return SUPPORTED_EXTENSIONS.includes(extension as SupportedExtension);
}

/**
 * Get the file extension from a path
 */
export function getFileExtension(path: string): string {
	const parts = path.split('.');
	return parts.length > 1 ? (parts[parts.length - 1] ?? '').toLowerCase() : '';
}

/**
 * Get the view type for a file
 */
export function getViewTypeForFile(file: TFile): string {
	const ext = file.extension.toLowerCase();
	if (isSupportedExtension(ext)) {
		return VIEW_TYPE_MAP[ext];
	}
	return 'markdown'; // Default fallback
}

/**
 * Check if a file is a markdown-like file (md or mdx)
 */
export function isMarkdownLike(file: TFile): boolean {
	const ext = file.extension.toLowerCase();
	return ext === 'md' || ext === 'mdx';
}

/**
 * Check if a file is an MDX file
 */
export function isMdxFile(file: TFile): boolean {
	return file.extension.toLowerCase() === 'mdx';
}

/**
 * Check if a file is a canvas file
 */
export function isCanvasFile(file: TFile): boolean {
	return file.extension.toLowerCase() === 'canvas';
}

/**
 * Check if a file is a base file
 */
export function isBaseFile(file: TFile): boolean {
	return file.extension.toLowerCase() === 'base';
}

/**
 * Get a file by path, trying with and without extension
 */
export function getFileByPath(app: App, path: string): TFile | null {
	// Try exact path first
	const exactMatch = app.vault.getAbstractFileByPath(path);
	if (exactMatch instanceof TFile) {
		return exactMatch;
	}

	// Try using metadataCache for fuzzy matching
	const file = app.metadataCache.getFirstLinkpathDest(path, '/');
	return file;
}

/**
 * Trim the file extension from a path for comparison
 */
export function trimFileExtension(path: string): string {
	const lastDot = path.lastIndexOf('.');
	if (lastDot > 0) {
		const ext = path.slice(lastDot + 1).toLowerCase();
		if (SUPPORTED_EXTENSIONS.includes(ext as SupportedExtension)) {
			return path.slice(0, lastDot);
		}
	}
	return path;
}

/**
 * Compare two paths, ignoring case and extension differences
 */
export function pathsEqual(path1: string, path2: string): boolean {
	const norm1 = trimFileExtension(path1).toLowerCase();
	const norm2 = trimFileExtension(path2).toLowerCase();
	return norm1 === norm2;
}

/**
 * Check if a leaf is showing a specific file
 */
export function leafHasFile(leaf: WorkspaceLeaf, filePath: string): boolean {
	const state = leaf.view?.getState?.();
	const leafFile = state?.file as string | undefined;
	
	if (!leafFile) return false;
	
	return pathsEqual(leafFile, filePath);
}
