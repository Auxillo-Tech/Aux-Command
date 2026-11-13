'use strict';

// Release files exist once per processor architecture. These helpers name the
// architecture the way Node does (process.arch: 'x64' or 'arm64') wherever a
// release file name spells it differently.

// AppImage, deb and rpm each have their own spelling for the same machine.
const PACKAGE_ARCH = { x64: 'x64', x86_64: 'x64', amd64: 'x64', arm64: 'arm64', aarch64: 'arm64' };

// 'x64' or 'arm64' for a package file such as Aux-Command-1.2.3-aarch64.rpm,
// '' when the name does not say.
function packageArch(name) {
  const match = /-([a-z0-9_]+)\.(?:AppImage|deb|rpm)$/u.exec(String(name || ''));
  return (match && Object.hasOwn(PACKAGE_ARCH, match[1]) && PACKAGE_ARCH[match[1]]) || '';
}

// The update description electron-updater reads on this architecture:
// latest-linux.yml on x64, latest-linux-<arch>.yml elsewhere.
function updaterMetadataName(arch = process.arch) {
  return arch === 'x64' ? 'latest-linux.yml' : `latest-linux-${arch}.yml`;
}

module.exports = { packageArch, updaterMetadataName };
