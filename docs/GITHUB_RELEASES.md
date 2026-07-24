# GitHub release and update runbook

Aux Command desktop release artifacts are distributed from GitHub Releases, not from the Auxillo production server.

## Release authority

- Canonical release host: GitHub Releases for `Auxillo-Tech/Aux-Command`.
- Auxillo server role: none for desktop binary hosting or update metadata unless a later architecture decision explicitly changes this.
- Supported Linux artifacts for 0.2.x:
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

## Release process

1. Verify the signing key: `export AUX_COMMAND_GPG_FINGERPRINT=FAC028574B9C6875D10DA4DC6443E86108ABD2A2`
2. Bump version in `package.json`, commit, push to `main`.
3. Create and push an immutable semver tag, for example `v0.2.2`.
4. Build: `npm run dist:x64`
5. Sign: `gpg --detach-sign --armor dist/SHA256SUMS && gpg --detach-sign --armor dist/release-manifest.json`
6. Publish: generate source archives + manifest, then create GitHub Release with all artifacts.
7. Verify: `npm run release:verify` (assumes `AUX_COMMAND_GPG_FINGERPRINT` is set).

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

The current release path is checksum-verified in Actions. GitHub artifact attestations are enabled only when the repository/org plan supports them; this private repository currently skips attestation because GitHub reports the feature unavailable. The release is signed with an Auxillo-controlled signing key (`SIGNING_KEY.asc`). Use `npm run release:verify` with the `AUX_COMMAND_GPG_FINGERPRINT` environment variable to authenticate releases. See the release-verification documentation in `scripts/verify-release.cjs`.
