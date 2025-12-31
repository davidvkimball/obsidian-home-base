# Home Base

Your dedicated home in your vault - opens a designated "home base" file on startup and via a sticky tab icon.

## Made for Vault CMS

Part of the [Vault CMS](https://github.com/davidvkimball/vault-cms) project.

## Features

### Home Base File

- **Multi-format support**: Works with `.md`, `.mdx`, `.canvas`, and `.base` files
- **Smart startup detection**: Automatically detects if Obsidian is already opening to the home base and avoids reloading
- **Configurable view modes**: Choose how markdown and MDX files open (Default, Reading view, Source mode, or Live Preview)
- **Command on open**: Automatically run any Obsidian command when opening the home base

### Tab Behavior

- **Open on startup**: Automatically open home base when launching Obsidian
- **Replace new tabs**: Option to replace new empty tabs with home base
- **New tab modes**: 
  - Only when no other tabs are open
  - Always replace new tabs
- **Keep existing tabs**: Preserve your current tabs when opening home base on startup

### Sticky Home Icon (Desktop)

- **Always visible**: A home icon that stays pinned to the left of the tab bar
- **Fixed position**: Never moves or disappears, even when tabs are opened or closed
- **Replace current tab**: Option to replace the current tab instead of opening a new one when clicked
- **Active state**: Icon highlights when home base is the active tab

### Mobile Features

- **Replace new tab button**: Change the mobile new tab button to a home icon

## Commands

- `Home Base: Open` - Open the home base file
- `Home Base: Set current file as home` - Set the currently active file as your home base
- `Home Base: Toggle sticky home icon` - Show or hide the sticky home icon in the tab bar

## Installation

Home Base is not yet available in the Community plugins section. Install using [BRAT](https://github.com/TfTHacker/obsidian42-brat) or manually:

### BRAT

1. Download the [Beta Reviewers Auto-update Tester (BRAT)](https://github.com/TfTHacker/obsidian42-brat) plugin from the [Obsidian community plugins directory](https://obsidian.md/plugins?id=obsidian42-brat) and enable it.
2. In the BRAT plugin settings, select `Add beta plugin`.
3. Paste the following: `https://github.com/davidvkimball/obsidian-home-base` and select `Add plugin`.

### Manual Installation

1. Download the latest release
2. Extract the files to your vault's `.obsidian/plugins/home-base/` folder
3. Reload Obsidian
4. Enable the plugin in Settings → Community plugins

### Development

1. Clone this repository
2. Run `pnpm install`
3. Run `pnpm run dev` to start compilation in watch mode
4. The plugin will be compiled to `main.js`

## Usage

1. Open Settings → Home Base
2. Set your home base file path (supports `.md`, `.mdx`, `.canvas`, `.base` files)
3. Configure when to open:
   - Enable "Open on startup" to automatically open when launching Obsidian
   - Enable "Replace new tabs" to open home base instead of empty tabs
4. Customize the sticky home icon (desktop only):
   - Enable "Sticky home icon" to show a persistent home button in the tab bar
   - Enable "Replace current tab" to replace the active tab instead of opening a new one when clicking the icon
5. Optionally set a command to run when opening home base
6. Bind commands to hotkeys in Settings → Hotkeys for quick access

## Compatibility

- Works on both desktop and mobile
- Compatible with Obsidian 0.15.0 and later
- Uses backward-compatible settings grouping for Obsidian 1.11.0+ while supporting older versions

## Development

This project uses TypeScript and follows Obsidian plugin best practices.

### Building

```bash
pnpm run build
```

### Development Mode

```bash
pnpm run dev
```

## Credits

- [Homepage](https://github.com/mirnovov/obsidian-homepage) - Startup behavior, command execution, and ribbon icon patterns
- [New Tab Default Page](https://github.com/chrisgrieser/new-tab-default-page) - New tab replacement logic and layout-change detection
