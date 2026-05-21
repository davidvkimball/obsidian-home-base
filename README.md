# Home Base for Obsidian

Your dedicated home in your vault - opens a designated "home base" you can easily come back to when you need it.

## Made for Vault CMS

Part of the [Vault CMS](https://github.com/davidvkimball/vault-cms) project.

## Features

### Home Base Types

Home Base supports multiple types of home pages:

- **File**: Open a specific file (supports `.md`, `.mdx`, `.canvas`, and `.base` files)
- **Workspace**: Load a specific workspace layout
- **Random file**: Open a random file from your vault
- **Random in folder**: Pick a random file from a specific folder
- **Graph view**: Open the graph view
- **Journal**: Open today's journal entry (requires Journals plugin)
- **Periodic Notes**: Open today's daily, weekly, monthly, or yearly note (requires Periodic Notes plugin or Daily Notes core plugin)
- **Nothing**: Default new tab

### Home Base Behavior

- **Smart startup detection**: Automatically detects if Obsidian is already opening to the home base and avoids reloading
- **Configurable view modes**: Choose how markdown and MDX files open (Default, Reading view, Source mode, or Live Preview)
- **Opening modes**: Control how home base opens on startup and manually:
  - Replace all open notes
  - Replace last note
  - Keep open notes
- **Command on open**: Automatically run any Obsidian command when opening the home base
- **Auto-scroll**: Automatically scroll to the bottom when opening
- **Revert view**: Restore default view when navigating away from home base

### Tab Behavior

- **Open on startup**: Automatically open home base when launching Obsidian
- **Replace new tabs**: Option to replace new empty tabs with home base or a different file
- **New tab modes**: 
  - Only when no other tabs are open
  - Always replace new tabs
- **Use different file for new tabs**: Configure a separate file to open for new tabs (independent from home base)
  - Supports all the same types as home base
  - New tabs are never pinned and multiple tabs are allowed
  - Works independently from home base behavior

### Sticky Home Icon (Desktop)

- **Always visible**: A home icon that stays pinned to the left of the tab bar
- **Fixed position**: Never moves or disappears, even when tabs are opened or closed
- **Customizable icon**: Choose any Lucide icon for the sticky home button
- **Hide tab header**: Option to hide the home base tab header when using the sticky icon
- **Active state**: Icon highlights when home base is the active tab
- **"Hidden" tab**: The home base tab stays pinned and hidden, merging with new empty tabs to save space and reduce clutter

### Mobile Features

- **Separate mobile home page**: Use a different home page on mobile devices
- **Replace mobile new tab button**: Change the mobile new tab button to a home icon
- **Separate mobile new tab**: Configure a different file to open for new tabs on mobile

## Commands

- `Home Base: Open` - Open the home base
- `Home Base: Set current file as home` - Set the currently active file as your home base
- `Home Base: Toggle sticky home icon` - Show or hide the sticky home icon in the tab bar
- `Home Base: Close` - Close the home base tab

## Installation

### Community Plugins Search

1. In Obsidian, go to Settings > Community plugins (enable it if you haven't already).
2. Search for [Home Base](https://obsidian.md/plugins?id=home-base) and click Install and then Enable.

### Manual

1. Download the latest release from the [Releases page](https://github.com/davidvkimball/obsidian-home-base/releases) and navigate to your Obsidian vault's `.obsidian/plugins/` directory.
2. Create a new folder called `home-base` and ensure `manifest.json`, `main.js`, and `styles.css` are in there.
3. In Obsidian, go to Settings > Community plugins (enable it if you haven't already) and then enable "Home Base."

### Development

1. Clone this repository
2. Run `pnpm install`
3. Run `pnpm run dev` to start compilation in watch mode
4. The plugin will be compiled to `main.js`

## Usage

1. Open Settings → Home Base
2. Configure your home base:
   - Choose the home base type (File, Workspace, Random, etc.)
   - Set the value (file path, workspace name, folder path, etc.) if required
   - Enable "Open on startup" to automatically open when launching Obsidian
   - Choose opening mode (how to handle existing tabs)
   - Set view mode for markdown/MDX files
3. Configure new tab behavior:
   - Enable "Replace new tabs" to replace empty tabs
   - Choose new tab replacement mode (only when empty, or always)
   - Optionally enable "Use different file for new tabs" to configure a separate file for new tabs
4. Customize the sticky home icon (desktop only):
   - Enable "Sticky home icon" to show a persistent home button in the tab bar
   - Choose a custom icon
   - Optionally hide the tab header when using sticky icon
5. Configure mobile settings:
   - Enable "Separate mobile home page" to use different settings on mobile
   - Enable "Replace mobile new tab button" to change the mobile button icon
   - Optionally enable "Separate mobile new tab" for mobile-specific new tab behavior
6. Optionally set a command to run when opening home base
7. Bind commands to hotkeys in Settings → Hotkeys for quick access

## Compatibility

- Works on both desktop and mobile
- Compatible with Obsidian 0.15.0 and later
- **Obsidian 1.11.0+ Native Support**: Acknowledges and integrates with Obsidian's native "Default file to open" feature. Home Base's "Open on startup" setting will override the native behavior if enabled.
- Uses backward-compatible settings grouping for Obsidian 1.11.0+ while supporting older versions

### Why Home Base?

While Obsidian 1.11.0+ includes a native "Default file to open" feature, Home Base provides several advanced capabilities not available natively:

- **Workspaces & Graphs**: Open a specific workspace layout or the graph view as your home base.
- **Sticky Home Icon (Ghost Tab)**: A persistent home button that stays pinned to the left, saving space and reducing tab clutter.
- **Commands on Open**: Automatically run any Obsidian command when your home base opens.
- **New Tab Replacement**: Replace new empty tabs with your home base (or a different file entirely).
- **Mobile-Specific Config**: Use different home bases and new tab behaviors for mobile vs desktop.
- **Smart Cleanup**: Optionally detach all open leaves or replace only the last note when opening home base.

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
