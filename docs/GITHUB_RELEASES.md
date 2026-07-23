# GitHub release and update runbook

Aux Command desktop release artifacts are distributed from GitHub Releases, not from the Auxillo production server.

## Release authority

- Canonical release host: GitHub Releases for `Auxillo-Tech/Aux-Command`.
- Auxillo server role: none for desktop binary hosting or update metadata unless a later architecture decision explicitly changes this.
- Supported Linux artifacts for 0.1.x:
  - `Aux-Command-<version>-x86_64.AppImage`
  - `Aux-Command-<version>-amd64.deb`
  - `Aux-Command-<version>-x86_64.rpm`
  - `aux-command-<version>-sbom.cdx.json`
  - `aux-command-<version>-source.tar.gz`
  - `aux-command-<version>-source.zip`
  - `latest-linux.yml`
  - `release-manifest.json`
  - `SHA256SUMS`

## Current implementation

- `package.json` configures `electron-builder` `publish.provider=github` for `Auxillo-Tech/Aux-Command`.
- Electron Builder generates `latest-linux.yml`; workflows publish it beside installers so `electron-updater` can discover Linux releases.
- `electron-updater` is wired into the main process as a manual GitHub Releases update checker.
- The diagnostics modal exposes update status and manual check/download/install controls when running as a packaged app.
- `.github/workflows/release.yml` builds, verifies, attests, uploads workflow artifacts, and can publish GitHub Release assets.
- `.github/workflows/linux-build.yml` runs the same core checks for pushes and pull requests.

## GitHub setup status

Completed:

- GitHub repository exists at `Auxillo-Tech/Aux-Command`.
- Source is pushed to `main`.
- GitHub Actions Linux CI is green on `main`.
- Repository metadata, topics, issue templates, pull request template, Dependabot config, and security policy are present.
- Electron Builder publish config targets `Auxillo-Tech/Aux-Command`.

Before the first real public release:

1. Keep or intentionally change the final owner/name. If it changes from `Auxillo-Tech/Aux-Command`, update `package.json` `build.publish.owner` and `build.publish.repo` before tagging.
2. Create and push an immutable semver tag, for example `v0.1.0`.
3. Let the `release` workflow build artifacts from the tag.
4. Review workflow logs, uploaded artifacts, `release-manifest.json`, `SHA256SUMS`, and attestations when the repository is public and GitHub enables artifact attestations for the org plan.
5. Publish the drafted GitHub Release only after the artifact set and release notes are correct.

## Manual local verification commands

```bash
npm ci
npm run check
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=moderate
npm audit signatures
npm run dist:x64 -- --publish never
bash scripts/source-archives.sh
npm run release:manifest -- --no-sign
npm run release:verify -- --allow-unsigned
(cd dist && sha256sum -c SHA256SUMS)
```

## Remaining trust gap

The current release path is checksum-verified in Actions. GitHub artifact attestations are enabled only when the repository/org plan supports them; this private repository currently skips attestation because GitHub reports the feature unavailable. The release is still unsigned unless an Auxillo-controlled signing key is configured. Checksums detect corruption; signatures authenticate publisher identity. Public production should not be called fully authenticated until signing is implemented and documented.
