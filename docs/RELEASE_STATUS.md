# Aux Command 0.1.0 — engineering release status

Validated: **2026-07-23T03:32:24Z**
Scope: **Linux x64 engineering release candidate with GitHub release/update path wired locally**

## Current verdict

The backend, process-lifecycle, packaging, dependency, UI safety, and release-integrity foundation is qualified for the next live-protocol and GitHub-publication phase.

This is **not yet a signed public production release**. GitHub Releases are now configured as the desktop distribution/update path for `Auxillo-Tech/Aux-Command`, but no real GitHub Release has been published from a tag, and artifacts are unsigned. Live endpoint/hardware qualification remains incomplete for optional integrations.

## Distribution decision

Aux Command desktop binaries and update metadata should live on **GitHub Releases**, not on the Auxillo production server.

- GitHub owns versioned desktop release assets, release notes, checksums, and update metadata.
- The Auxillo server does not need to host desktop installer/update files.
- GitHub release/update configuration targets `Auxillo-Tech/Aux-Command`; update `package.json` `build.publish.owner` and `build.publish.repo` if the repository changes before tagging.

See `docs/GITHUB_RELEASES.md` for the release/update runbook.

## Toolchain

- Node.js: `v22.22.2`
- npm: `10.9.7`
- Python: `3.11.15`
- Electron: `43.2.0`
- electron-builder: `26.15.3`
- electron-updater: `6.8.9`
- Host: Linux x64

## Verified foundation

### Source and dependency gates

- `npm run check`: **105/105 tests passed**
- JavaScript syntax: 48 files passed
- Python syntax: 5 files passed
- Shell syntax: 5 files passed
- `npm audit --omit=dev --audit-level=moderate`: zero vulnerabilities
- `npm audit --audit-level=moderate`: zero vulnerabilities
- `npm audit signatures`: 303 verified registry signatures and 41 verified attestations

### Security and process lifecycle

- Renderer uses context isolation and sandboxing; Node integration is disabled.
- Main-window sender and main-frame validation protect privileged IPC.
- Navigation, popup creation, Chromium permission requests, and permission checks are denied by default.
- Hardware acceleration is disabled before Electron readiness.
- Electron fuses verified from the packaged executable:
  - Run as Node disabled
  - cookie encryption enabled
  - `NODE_OPTIONS` disabled
  - Node CLI inspection disabled
  - ASAR-only application loading enabled
- PTY and tunnel children launch through an exact-parent Linux `PR_SET_PDEATHSIG` guard with readiness synchronization.
- The parent-death signal is `SIGKILL`, preventing bridge or OpenSSH handlers from suppressing abnormal-exit cleanup.
- Normal user-requested terminal termination uses the graceful control path with timed force escalation.
- Corrupt JSON stores are quarantined instead of silently discarded.
- SFTP downloads are committed with mode `0600`.
- Tunnel state becomes `running` only from OpenSSH readiness evidence, never elapsed time alone.

### UI/functionality gates added in this phase

- Local startup commands now execute before returning to an interactive login shell.
- Mosh-visible SSH transport options now alter the generated Mosh `--ssh=` command instead of being inert.
- GitHub release update service wired through `electron-updater`.
- Packaged diagnostics modal exposes GitHub update status and manual check/download/install controls.
- Session-toolbar controls now derive enabled/disabled state from active protocol and tab count.
- SFTP ownership is tied to the active owning terminal tab to avoid stale cross-tab actions.
- Credential-kind changes require replacement/removal instead of silently reinterpreting a stored secret.
- SFTP busy state is request-token scoped to avoid stale request cleanup.
- Tunnel startup feedback distinguishes `starting` from evidence-backed `running`.
- Routine notifications use the persistent status bar instead of obscuring terminal content; actionable errors remain accessible and capped.
- Compact UI, separate profile connect/edit actions, contextual control availability, and a durable initialization-retry surface are source-tested.

### Packaged runtime

Fresh AppImage with isolated configuration/cache passed:

- preload API and initial-state checks, including `updates` API namespace
- local interactive PTY command/output
- tiled terminal layout
- guarded broadcast confirmation and persistent warning
- terminal search hosted in the contextual toolbar instead of over the terminal canvas
- command palette
- session duplication
- replacement-first reconnect
- pane resizing
- snippet creation/execution
- diagnostics modal with GitHub update state
- 1480×920 desktop screenshot capture with no clipping or notification overlay
- 1024×768 compact-layout screenshot capture; collapsed/open sidebar transitions preserve a full-width workspace

Packaged accessibility/source assertions passed:

- linked tab/tabpanel relationships
- one roving terminal-tab focus target
- programmatic input labels
- modal background isolation
- forward focus containment
- focus restoration
- no terminal-wide live region
- SFTP busy-state semantics

### Distribution qualification

- Fedora RPM, Ubuntu `.deb`, and Fedora AppImage qualification were previously performed for the 0.1.0 artifact family.
- Current local package build completed for AppImage, `.deb`, and `.rpm` with `--publish never`; Electron Builder generated `latest-linux.yml` for GitHub release discovery.
- Source archives were generated and verified to exclude `node_modules`, `dist`, and `.cache`.
- Production CycloneDX SBOM and runtime dependency licenses are generated before release manifest creation.
- GitHub Actions workflows are present for CI build and tag/manual release publication.
- Workflow YAML parse check passed for `.github/workflows/linux-build.yml` and `.github/workflows/release.yml`.

## Current artifacts from latest local build

The frozen six-artifact set contains:

- `Aux-Command-0.1.0-x86_64.AppImage`
- `Aux-Command-0.1.0-amd64.deb`
- `Aux-Command-0.1.0-x86_64.rpm`
- `aux-command-0.1.0-sbom.cdx.json`
- `aux-command-0.1.0-source.tar.gz`
- `aux-command-0.1.0-source.zip`

Exact byte sizes and SHA-256 digests are canonical in `dist/release-manifest.json` and `dist/SHA256SUMS`. They are intentionally not duplicated here because this document is included in the source archives; embedding source-archive hashes here would create a circular, immediately stale release record.

`npm run release:verify -- --allow-unsigned` and `(cd dist && sha256sum -c SHA256SUMS)` passed for the frozen six-artifact set.

## Remaining release gates

### External trust/provenance blockers

1. **Git repository:** this directory is not a Git repository, so JD still needs to create/push the GitHub repo before real release tagging.
2. **Immutable release tag:** no `v0.1.0` GitHub tag/release exists yet from this source tree.
3. **Production signing identity:** no controlled Auxillo signing key is available locally. The verifier supports full-fingerprint-pinned GPG validation, but unsigned releases currently require `--allow-unsigned`.
4. **CI provenance execution:** workflows are configured, but the latest artifacts were produced locally, not yet by GitHub Actions.
5. **Published updater validation:** update checks are wired for GitHub Releases, but cannot be end-to-end proven until a GitHub release exists.

### Product/live qualification still required

Representative live qualification is still needed for:

- real remote SSH/SFTP endpoints beyond local fixtures
- OpenSSH local, remote, and SOCKS forwarding against representative hosts
- Mosh
- RDP
- VNC
- X11 forwarding
- physical serial hardware
- assistive-technology testing with a real screen reader
- broader Wayland/X11, desktop-environment, high-DPI, and multi-monitor coverage

See `docs/LIVE_QUALIFICATION.md` for the live evidence checklist.

## Release classification

- **Foundation engineering status:** qualified for GitHub repo setup and live-protocol qualification
- **Internal x64 engineering release:** yes
- **GitHub release/update path wired in code:** yes
- **Published GitHub release:** no
- **Signed/authenticated public release:** no
- **Unrestricted production 1.0:** no
