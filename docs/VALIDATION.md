# Validation

Run the full source validation from the repository root:

```bash
npm run check
```

This performs:

1. Node syntax checks for every `.js` and `.cjs` file outside generated dependency/build directories.
2. Python AST parsing for the PTY bridge.
3. `bash -n` checks for all bundled shell scripts.
4. The Node test suite, including real PTY, process-lifecycle integration, tunnel failure-state, credential persistence, and renderer lifecycle regression tests.

For a clean source checkout with network access:

```bash
./scripts/bootstrap.sh
npm start
```

To create Linux packages for the configured Linux x86_64 release targets:

```bash
npm run dist
```

To create the verified x64 Linux artifacts on this Fedora workstation:

```bash
npm run dist:x64 -- --publish never
```

`dist:x64` wraps Electron Builder with local compatibility handling for build-host gaps seen on current Fedora: missing `libcrypt.so.1` for Electron Builder's bundled `fpm`, and missing `rpmbuild` for RPM creation. The wrapper downloads/extracts only the required Fedora build packages under `.cache/` when needed; it does not install system packages.

The GitHub Actions workflow at `.github/workflows/linux-build.yml` performs validation and creates x86_64 AppImage, Debian and RPM artifacts without publishing them from normal branch CI.
