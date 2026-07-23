# Pull request checklist

## Summary

- 

## Verification

- [ ] `npm run check`
- [ ] `npm audit --omit=dev --audit-level=moderate`
- [ ] `npm audit --audit-level=moderate`
- [ ] `npm audit signatures`
- [ ] Packaged build/smoke checks when runtime, renderer, packaging, updater, or release files changed

## Release impact

- [ ] No release-impacting changes
- [ ] Release docs/checksums/manifests need regeneration before tagging
- [ ] GitHub Release/update behavior affected

## Security review

- [ ] No credential, host-key, tunnel, IPC, filesystem, or updater security boundary changed
- [ ] Security-sensitive behavior changed and has focused regression coverage
