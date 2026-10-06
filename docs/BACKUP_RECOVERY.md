# Import, export and recovery

## Import SSH configuration

**Import ~/.ssh/config** reads the default SSH configuration and included files. It does not open a file chooser or connect to hosts. A progress dialog is followed by the number of named Host entries found, new profiles added and existing profiles refreshed. Wildcard-only Host blocks do not create profiles.

Reimport refreshes connection settings using OpenSSH's effective configuration. Existing display names, groups and saved credential references are retained. If every alias is already present, the result can correctly show zero additions. Errors appear in a dialog rather than looking like an unresponsive button.

## Import profile JSON

Choose **Import / Export → Import Aux Command profiles**, select an Aux Command profile export, and review the counts before applying it:

- **Add missing; keep existing profiles:** the default; repeated imports do not add duplicates or overwrite differing profiles.
- **Update matching profiles:** updates matching IDs or SSH aliases. A local credential reference is retained only when the connection identity is unchanged.
- **Create separate copies:** deliberately creates new IDs.

Invalid rows and unsupported export versions are rejected before any profile changes. A recovery point is created before applying a valid import. Import files can contain startup commands and snippets, so only import files you trust.

## Portable exports

**Export profiles** contains profiles and snippets. **Back up workspace** additionally contains layout, sidebar groups, highlighting, language and assist preferences.

Portable exports exclude saved credential values and references, private-key material, SSH config files, AI endpoints and running-session restoration. Notes and commands may contain sensitive text entered by the operator; exported files should still be treated as private. Key paths inside the exporting user's home directory use `~/` so they resolve under the receiving user's home.

A receiving computer needs its own SSH configuration, keys and credentials. Portable workspace restore reuses an existing local credential only when both the profile ID and connection identity match; it never attaches a local secret solely because an imported file names its ID.

## Workspace restore and local recovery points

**Restore workspace backup** previews the profile/snippet count before replacing the lists and workspace preferences. It does not restart active connections. The current workspace is saved first.

**Recovery points** lists the ten most recent automatic local snapshots created before imports, restores and application updates. These retain profile/settings data and local credential references, but do not copy the keyring, private-key files or credential values. A deleted credential cannot be recovered from a workspace snapshot.

Files are stored under `aux-command-data/recovery/` inside the application's user-data directory with private permissions. A pending restore journal allows an interrupted multi-file restore to roll back on next startup. Failed writes also attempt immediate rollback.

## AppImage update recovery

Before installation, the updater verifies the downloaded installer against the signed manifest, saves a checksum-verified copy of the current AppImage, and creates a workspace recovery point. A synchronous installation failure attempts to restore the original AppImage.

**Updates → Restore previous version** restores the previous AppImage on disk. Close and reopen the application when your work is finished. This is an explicit rollback: the previous version may not contain the latest fixes. Workspace data is retained; use a workspace recovery point separately if needed.

If the new application cannot start, the previous executable remains under `update-recovery/` in the application's user-data directory (normally `~/.config/Aux Command/update-recovery/`). The `previous.json` file identifies the saved AppImage and version. Run that AppImage directly to recover. A corrupted recovery copy is rejected by checksum verification.

Debian and RPM installations use the package manager for application-version rollback. Workspace recovery points work independently of installer format.
