/**
 * Command Suggester Component
 * Provides autocomplete for Obsidian commands in settings
 */

import { AbstractInputSuggest, App, Command } from 'obsidian';

/**
 * Command suggester that provides autocomplete for Obsidian commands
 */
export class CommandSuggest extends AbstractInputSuggest<Command> {
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(query: string): Command[] {
		const lowerQuery = query.toLowerCase();
		const commands: Command[] = [];

		// Get all commands from the app
		const appWithCommands = this.app as App & { 
			commands?: { commands?: Record<string, Command> } 
		};
		const allCommands = appWithCommands.commands?.commands;
		
		if (allCommands) {
			for (const command of Object.values(allCommands)) {
				if (command.name.toLowerCase().includes(lowerQuery) ||
					command.id.toLowerCase().includes(lowerQuery)) {
					commands.push(command);
				}
			}
		}

		// Sort alphabetically by name
		commands.sort((a, b) => a.name.localeCompare(b.name));

		// Limit results
		return commands.slice(0, 30);
	}

	renderSuggestion(command: Command, el: HTMLElement): void {
		el.createEl('div', { 
			text: command.name,
			cls: 'suggestion-title'
		});
		
		el.createEl('small', { 
			text: command.id,
			cls: 'suggestion-note'
		});
	}

	selectSuggestion(command: Command): void {
		this.inputEl.value = command.id;
		this.inputEl.trigger('input');
		this.close();
	}
}

/**
 * Extended App interface with commands
 */
interface AppWithCommands extends App {
	commands?: {
		commands?: Record<string, Command>;
		executeCommandById?: (commandId: string) => boolean | Promise<void>;
	};
}

/**
 * Get a command by its ID
 */
export function getCommandById(app: App, commandId: string): Command | undefined {
	const appWithCommands = app as AppWithCommands;
	const commands = appWithCommands.commands?.commands;
	return commands?.[commandId];
}

/**
 * Execute a command by its ID
 */
export function executeCommand(app: App, commandId: string): boolean {
	if (!commandId) return false;
	
	const appWithCommands = app as AppWithCommands;
	const result = appWithCommands.commands?.executeCommandById?.(commandId);
	return result !== false;
}
