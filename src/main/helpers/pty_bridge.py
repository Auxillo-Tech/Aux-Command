#!/usr/bin/env python3
"""Minimal PTY bridge for Aux Command.

The parent process supplies a JSON specification on file descriptor 4. Terminal
input arrives on stdin, PTY output is written to stdout, and newline-delimited
control messages arrive on file descriptor 3.
"""

from __future__ import annotations

import errno
import fcntl
import json
import os
import pty
import selectors
import signal
import struct
import sys
import termios
from typing import Any

MAX_CONTROL_BUFFER = 1_048_576
MAX_IO_CHUNK = 65_536


def read_spec(fd: int = 4) -> dict[str, Any]:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = os.read(fd, min(MAX_IO_CHUNK, MAX_CONTROL_BUFFER + 1 - total))
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
        if total > MAX_CONTROL_BUFFER:
            raise ValueError("PTY specification is too large")
        try:
            value = json.loads(b"".join(chunks).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
        if not isinstance(value, dict):
            raise ValueError("PTY specification must be an object")
        return value
    value = json.loads(b"".join(chunks).decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("PTY specification must be an object")
    return value


def bounded_int(value: Any, minimum: int, maximum: int, fallback: int) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, result))


def set_window_size(master_fd: int, cols: Any, rows: Any) -> None:
    safe_cols = bounded_int(cols, 20, 500, 80)
    safe_rows = bounded_int(rows, 5, 300, 24)
    payload = struct.pack("HHHH", safe_rows, safe_cols, 0, 0)
    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, payload)


def set_nonblocking(fd: int) -> None:
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)


def write_all(fd: int, data: bytes) -> None:
    view = memoryview(data)
    while view:
        try:
            written = os.write(fd, view)
            view = view[written:]
        except InterruptedError:
            continue
        except BrokenPipeError:
            return


def signal_child(pid: int, sig: int) -> None:
    try:
        os.killpg(pid, sig)
    except (ProcessLookupError, PermissionError):
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            pass


def handle_control_line(line: bytes, master_fd: int, child_pid: int) -> None:
    if not line.strip():
        return
    try:
        message = json.loads(line.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return
    if not isinstance(message, dict):
        return

    action = message.get("type")
    if action == "resize":
        set_window_size(master_fd, message.get("cols"), message.get("rows"))
        try:
            os.killpg(child_pid, signal.SIGWINCH)
        except (ProcessLookupError, PermissionError):
            pass
    elif action == "signal":
        requested = str(message.get("signal", "SIGTERM"))
        allowed = {
            "SIGINT": signal.SIGINT,
            "SIGHUP": signal.SIGHUP,
            "SIGTERM": signal.SIGTERM,
            "SIGKILL": signal.SIGKILL,
        }
        signal_child(child_pid, allowed.get(requested, signal.SIGTERM))


def wait_status_to_exit_code(status: int) -> int:
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    if os.WIFSIGNALED(status):
        return 128 + os.WTERMSIG(status)
    return 1


def main() -> int:
    spec = read_spec()
    command = spec.get("command")
    args = spec.get("args", [])
    cwd = spec.get("cwd") or os.path.expanduser("~")
    env = spec.get("env") or dict(os.environ)

    if not isinstance(command, str) or not command or "\x00" in command:
        raise ValueError("Invalid PTY command")
    if not isinstance(args, list) or any(not isinstance(arg, str) or "\x00" in arg for arg in args):
        raise ValueError("Invalid PTY arguments")
    if not isinstance(cwd, str) or not cwd or "\x00" in cwd:
        raise ValueError("Invalid PTY working directory")
    if not isinstance(env, dict):
        raise ValueError("Invalid PTY environment")

    child_env: dict[str, str] = {}
    for key, value in env.items():
        if not isinstance(key, str) or not isinstance(value, str) or "\x00" in key or "\x00" in value or "=" in key:
            continue
        child_env[key] = value

    child_pid, master_fd = pty.fork()
    if child_pid == 0:
        try:
            os.chdir(cwd)
            os.execvpe(command, [command, *args], child_env)
        except BaseException as exc:  # The child can only report through its PTY.
            message = f"Aux Command: unable to start {command}: {exc}\r\n".encode("utf-8", "replace")
            write_all(sys.stderr.fileno(), message)
            os._exit(127)

    set_window_size(master_fd, spec.get("cols"), spec.get("rows"))
    set_nonblocking(master_fd)
    set_nonblocking(sys.stdin.fileno())

    control_fd = 3
    control_available = True
    try:
        set_nonblocking(control_fd)
    except OSError:
        control_available = False

    input_fd = 5
    try:
        set_nonblocking(input_fd)
    except OSError:
        input_fd = sys.stdin.fileno()

    selector = selectors.DefaultSelector()
    selector.register(master_fd, selectors.EVENT_READ, "pty")
    selector.register(input_fd, selectors.EVENT_READ, "stdin")
    if control_available:
        selector.register(control_fd, selectors.EVENT_READ, "control")

    control_buffer = bytearray()
    pty_open = True
    child_status: int | None = None

    def forward_signal(signum: int, _frame: Any) -> None:
        signal_child(child_pid, signum)

    for sig in (signal.SIGINT, signal.SIGHUP, signal.SIGTERM):
        signal.signal(sig, forward_signal)

    while pty_open or child_status is None:
        try:
            events = selector.select(timeout=0.1)
        except InterruptedError:
            events = []

        for key, _mask in events:
            if key.data == "pty":
                try:
                    data = os.read(master_fd, MAX_IO_CHUNK)
                except BlockingIOError:
                    continue
                except OSError as exc:
                    if exc.errno == errno.EIO:
                        data = b""
                    else:
                        raise
                if data:
                    write_all(sys.stdout.fileno(), data)
                else:
                    pty_open = False
                    try:
                        selector.unregister(master_fd)
                    except Exception:
                        pass
            elif key.data == "stdin":
                try:
                    data = os.read(input_fd, MAX_IO_CHUNK)
                except BlockingIOError:
                    continue
                if data:
                    try:
                        write_all(master_fd, data)
                    except OSError as exc:
                        if exc.errno not in (errno.EIO, errno.EBADF):
                            raise
                else:
                    try:
                        selector.unregister(input_fd)
                    except Exception:
                        pass
            elif key.data == "control":
                try:
                    data = os.read(control_fd, MAX_IO_CHUNK)
                except BlockingIOError:
                    continue
                if not data:
                    try:
                        selector.unregister(control_fd)
                    except Exception:
                        pass
                    continue
                control_buffer.extend(data)
                if len(control_buffer) > MAX_CONTROL_BUFFER:
                    control_buffer.clear()
                    continue
                while b"\n" in control_buffer:
                    line, _, remainder = control_buffer.partition(b"\n")
                    control_buffer = bytearray(remainder)
                    handle_control_line(line, master_fd, child_pid)

        if child_status is None:
            waited_pid, status = os.waitpid(child_pid, os.WNOHANG)
            if waited_pid == child_pid:
                child_status = status

        if child_status is not None and not pty_open:
            break

    if child_status is None:
        _, child_status = os.waitpid(child_pid, 0)

    try:
        selector.close()
    finally:
        try:
            os.close(master_fd)
        except OSError:
            pass

    return wait_status_to_exit_code(child_status)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BaseException as exc:
        if isinstance(exc, SystemExit):
            raise
        sys.stderr.write(f"Aux Command PTY bridge failed: {exc}\n")
        raise SystemExit(127)
