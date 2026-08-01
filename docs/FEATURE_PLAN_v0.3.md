# Aux Command — Feature Implementation Plan (v0.3+)

## Priority Order (recommended)

### 1. SFTP Transfer Queue with Pause/Resume
**Effort: Medium** | **Impact: High** | **Status: Shipped in 0.2.x**

**What it does:** 
- Queue multiple file uploads/downloads in the SFTP panel
- Show pending/running/completed/failed state for each transfer
- Pause/resume individual transfers or the entire queue
- Retry failed transfers
- Track progress per file (already have sftp:progress events)
- Persist queue across SFTP session (not restarts)

**Implementation:**
```
Main process:
  src/main/services/transfer-queue.cjs (NEW)
    - TransferQueue class with add/pause/resume/cancel/retry
    - State: { id, profileId, direction, localPath, remotePath, status, transferred, total, error }
    - emit 'sftp:queue-update' events to renderer
    - Respects per-transfer pause via offset tracking (SSH2 fastGet/fastPut step callback)

  src/main/ipc.cjs
    - Add handlers: transfer:enqueue, transfer:pause, transfer:resume, transfer:cancel, transfer:retry, transfer:list

Renderer:
  src/renderer/renderer.js
    - New transfer queue UI panel in SFTP sidebar
    - Queue list with progress bars, pause/resume/cancel buttons
    - Subscribe to sftp:queue-update events

  src/renderer/styles.css
    - Transfer queue styling (progress bars, status chips, compact list)
```

---

### 2. Session Persistence Across Restarts
**Effort: Medium** | **Impact: High** | **Status: Shipped in 0.2.x**

**What it does:**
- Remember open tabs and their active profiles when app restarts
- Auto-reconnect to persistent SSH/terminal sessions on launch
- Restore workspace layout (tiled/single, pane sizes)
- Terminal PTYs can't survive process restart; we close them gracefully and reconnect on next launch

**Implementation:**
```
Main process:
  src/main/lib/settings-store.cjs
    - Add session persistence field: { sessions: [{profileId, protocol, createdAt}] }
  
  src/main/ipc.cjs
    - handler 'app:restore-sessions' → returns last session list
    - handler 'app:save-sessions' → persists current tab state
  
  src/main/services/terminal-service.cjs
    - On window close, save session state
    - On startup, emit stored session list

Renderer:
  src/renderer/renderer.js
    - On init, check for persisted sessions → auto-reconnect
    - Debounced session save on tab open/close/activate
```

---

### 3. Embedded RDP Surface
**Effort: High** | **Impact: Medium** | **Target: v0.3**

**What it does:**
- Replace external FreeRDP launcher with embedded RDP tab in the terminal stack
- Uses xfreerdp3 piped to a canvas element
- Keyboard/mouse forwarding from the web contents to the RDP pipe

**Implementation:**
```
Main process:
  src/main/services/rdp-service.cjs (NEW)
    - Spawn xfreerdp3 /v:host:port with /gdi:sw /video:embedded-flags
    - Pipe framebuffer output to renderer via IPC
    - Forward keyboard/mouse events from renderer to child stdin
  
  src/main/ipc.cjs
    - handlers: rdp:create, rdp:input, rdp:resize, rdp:close, rdp:clipboard

Preload:
  src/preload/index.cjs
    - New namespace: rdp: { create, input, resize, close }

Renderer:
  src/renderer/renderer.js
    - RDP tab type with canvas rendering
    - Mouse/keyboard event capture and forwarding
```

**Alternative (lower effort):** Embed a minimal VNC web client (noVNC) since it's pure JS/Canvas and doesn't require a native binary pipe. Then do RDP via a gateway approach.

---

### 4. Team/Shared Profiles
**Effort: High** | **Impact: Medium** | **Target: v0.5**

**What it does:**
- Share profile configurations between team members
- Sync via file (shared JSON), HTTP endpoint, or SSH/SFTP source
- Access control: read/write boundaries
- No credential sharing — each user provides their own

**Implementation:**
```
Main process:
  src/main/lib/profile-sync.cjs (NEW)
    - ProfileSync class with local file, HTTP, and SSH transport backends
    - Conflict resolution (last-write-wins with backup)
    - Periodic sync timer
    - Credential stripping on export
  
  src/main/ipc.cjs
    - handlers: sync:configure, sync:now, sync:status, sync:conflicts

Renderer:
  src/renderer/renderer.js
    - Shared profiles group with sync indicator
    - New sync configuration modal (source URL, auth, interval)
    - Conflict resolution UI
```

---

## Total Implementation Plan

| Feature | Files Changed | New Files | Est. Lines |
|---------|--------------|-----------|------------|
| SFTP Queue | 6 | 1 | ~500 |
| Session Persistence | 4 | 0 | ~200 |
| Embedded RDP/VNC | 8+ | 2+ | ~800+ |
| Team Profiles | 5+ | 1+ | ~400+ |

**Next Action:** Start with SFTP Transfer Queue since it has the highest daily-driver impact.
