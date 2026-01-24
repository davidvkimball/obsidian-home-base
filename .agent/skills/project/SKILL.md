---
name: project
description: Project-specific architecture, maintenance tasks, and unique conventions for Home Base.
---

# Home Base Project Skill

Your dedicated home in your vault. This plugin creates a landing page or "Home" experience within Obsidian, acting as a central hub for vault navigation and dashboarding.

## Core Architecture

- **Dashboard View**: Implements a custom view or overrides a standard note to act as the "Home" page.
- **Visual Design**: Uses a 7.5KB `styles.css` to provide a distinct, polished dashboard look.
- **Centralized Hub**: Interfaces with other vault notes to aggregate information or provide quick-launch buttons.

## Project-Specific Conventions

- **"Home" Workflow**: Designed to be the first thing a user sees or returns to when navigating their vault.
- **Stylized UX**: High emphasis on aesthetics and layout consistency over standard editor functions.
- **Mobile/Desktop Parity**: Aims for a consistent dashboard experience across all devices.

## Key Files

- `src/main.ts`: Main entry point for the Home view and command registration.
- `manifest.json`: Plugin identification and id (`home-base`).
- `styles.css`: Dashboard layouts, custom components, and visual styling.
- `version-bump.mjs`: Advanced version management script.

## Maintenance Tasks

- **View Registration**: Ensure the Home view persists correctly during vault reloads.
- **Aesthetics Audit**: Test the dashboard layout against various base themes (Light/Dark).
- **Navigation Links**: Verify that all centralized hub links are resolving properly.
