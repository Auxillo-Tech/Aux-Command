"""Run source desktop UI checks in a disposable X session and profile store."""

import json
import os
import re
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
LOG_TAIL_BYTES = 8192
LOG_OUTPUT_BYTES = 12000


def redact(text):
    # Cover common key/value and URL query forms; replace the whole quoted value.
    text = re.sub(r'(?i)(\bbearer\s+)[^\s"\',;]+', r"\1[REDACTED]", text)
    text = re.sub(r"(?i)([a-z][a-z0-9+.-]*://)[^/\s@]+@", r"\1[REDACTED]@", text)
    keys = r"(?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|apikey|password|passwd|secret)"
    text = re.sub(
        r'(?i)(["\']?'
        + keys
        + r'["\']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[^\s&,;]+)',
        r"\1[REDACTED]",
        text,
    )
    text = re.sub(r"(?i)([?&]" + keys + r"=)[^&#\s]+", r"\1[REDACTED]", text)
    return text


def diagnostic(path):
    try:
        with open(path, "rb") as stream:
            stream.seek(0, os.SEEK_END)
            end = stream.tell()
            start = max(0, end - LOG_TAIL_BYTES)
            stream.seek(start)
            data = stream.read(LOG_TAIL_BYTES)
        if start:
            newline = data.find(b"\n")
            data = data[newline + 1 :] if newline >= 0 else b""
        text = redact(data.decode("utf-8", errors="replace"))
        encoded = text.encode("utf-8")
        if len(encoded) > LOG_OUTPUT_BYTES:
            encoded = encoded[-LOG_OUTPUT_BYTES:]
            nl = encoded.find(b"\n")
            encoded = encoded[nl + 1 :] if nl >= 0 else b""
            text = encoded.decode("utf-8")
        return text.rstrip() or "[log contained no complete lines]"
    except OSError as exc:
        return "[log unavailable: " + str(exc) + "]"


def fail(message, log_path):
    print(
        message + "\n" + str(log_path) + ":\n" + diagnostic(log_path),
        file=sys.stderr,
        flush=True,
    )
    raise RuntimeError(message)


with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
logdir = Path(tempfile.mkdtemp(prefix="aux-ui-qualification-"))
env = dict(
    os.environ,
    AUX_COMMAND_CDP_PORT=str(port),
    AUX_COMMAND_HEADLESS="0",
    AUX_COMMAND_SOAK_ITERATIONS="20",
    AUX_COMMAND_SCREENSHOT=str(logdir / "smoke.png"),
    AUX_WORKSPACE_SCREENSHOT=str(logdir / "workspace.png"),
    AUX_FILE_SCREENSHOT=str(logdir / "files.png"),
    AUX_COMMAND_SOAK_SCREENSHOT=str(logdir / "soak.png"),
)
package = os.environ.get("AUX_PACKAGE_EXECUTABLE")
if package:
    env["HOME"] = str(logdir / "home")
    Path(env["HOME"]).mkdir()
    env["XDG_CONFIG_HOME"] = str(logdir / "config")
command = (
    [package]
    if package
    else [
        str(root / "node_modules/electron/dist/electron"),
        "scripts/ui-recovery-fixture.cjs",
    ]
)
log_path = logdir / "electron.log"
env["AUX_UI_LOG_PATH"] = str(log_path)
script_timeout = float(os.environ.get("AUX_UI_SCRIPT_TIMEOUT", "240"))
ready_timeout = float(os.environ.get("AUX_UI_READY_TIMEOUT", "20"))
process = None
with log_path.open("w") as log:
    process = subprocess.Popen(
        ["xvfb-run", "-a"]
        + command
        + [
            "--remote-debugging-port=" + str(port),
            "--remote-allow-origins=http://127.0.0.1:" + str(port),
        ],
        cwd=root,
        env=env,
        stdout=log,
        stderr=log,
        start_new_session=True,
    )
try:
    deadline = time.monotonic() + ready_timeout
    readiness_error = "none"
    while time.monotonic() < deadline:
        if process.poll() is not None:
            fail("Electron exited with exit code " + str(process.returncode), log_path)
        try:
            pages = json.load(
                urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=1)
            )
            if any(page.get("title") == "Aux Command" for page in pages):
                break
        except (OSError, ValueError) as exc:
            readiness_error = type(exc).__name__
        time.sleep(0.2)
    else:
        fail(
            "Electron did not become ready within "
            + str(ready_timeout)
            + " seconds; last readiness error: "
            + readiness_error,
            log_path,
        )
    for script in os.environ.get(
        "AUX_UI_SCRIPTS",
        "e2e-cdp-smoke.py,test-recovery-ui.py,test-workspace-ui.py,test-file-browser-ui.py,test-panels-ui.py,test-named-workspaces-ui.py,test-product-upgrades-ui.py,test-desktop-controls-ui.py,test-languages-ui.py,soak-cdp.py",
    ).split(","):
        script_path = Path(script)
        if not script_path.is_absolute():
            script_path = root / "scripts" / script_path
        name = script_path.name
        script_log = logdir / (name + ".log")
        try:
            with script_log.open("w") as output:
                result = subprocess.run(
                    [sys.executable, str(script_path)],
                    cwd=root,
                    env=env,
                    stdout=output,
                    stderr=subprocess.STDOUT,
                    timeout=script_timeout,
                    check=False,
                )
        except subprocess.TimeoutExpired:
            fail(
                name + " timed out after " + str(script_timeout) + " seconds",
                script_log,
            )
        if result.returncode:
            fail(name + " failed with exit code " + str(result.returncode), script_log)
        print(name + ": passed", flush=True)
except RuntimeError:
    # The detailed error was already emitted; avoid an additional traceback.
    sys.exit(1)
finally:
    if process is not None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
print("Evidence: " + str(logdir))
