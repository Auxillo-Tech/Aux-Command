#!/usr/bin/env python3
"""Run a command tree that is terminated when its exact owner disappears."""

from __future__ import annotations

import ctypes
import errno
import os
import signal
import sys
import time
from typing import Iterable

PR_SET_PDEATHSIG = 1
PR_SET_CHILD_SUBREAPER = 36


def _prctl(option: int, value: int) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    result = libc.prctl(option, value, 0, 0, 0)
    if result != 0:
        code = ctypes.get_errno() or errno.EINVAL
        raise OSError(code, os.strerror(code))


def arm_parent_death_signal(expected_parent_pid: int, signum: int = signal.SIGTERM) -> None:
    if expected_parent_pid <= 1 or os.getppid() != expected_parent_pid:
        raise RuntimeError('Expected parent process is no longer present')
    _prctl(PR_SET_PDEATHSIG, signum)
    if os.getppid() != expected_parent_pid:
        raise RuntimeError('Parent process exited before guard activation')


def parse_arguments(argv: list[str]) -> tuple[int, int | None, list[str]]:
    if len(argv) < 6 or argv[1] != '--parent-pid':
        raise RuntimeError('usage: process_guard.py --parent-pid PID [--ready-fd FD] -- COMMAND [ARG ...]')
    try:
        expected_parent_pid = int(argv[2])
    except ValueError as error:
        raise RuntimeError('Invalid expected parent PID') from error
    index = 3
    ready_fd = None
    if index < len(argv) and argv[index] == '--ready-fd':
        if index + 1 >= len(argv):
            raise RuntimeError('Missing readiness file descriptor')
        try:
            ready_fd = int(argv[index + 1])
        except ValueError as error:
            raise RuntimeError('Invalid readiness file descriptor') from error
        index += 2
    if index >= len(argv) or argv[index] != '--' or index + 1 >= len(argv):
        raise RuntimeError('Missing guarded command')
    return expected_parent_pid, ready_fd, argv[index + 1:]


def _process_parents() -> dict[int, int]:
    parents: dict[int, int] = {}
    try:
        entries: Iterable[str] = os.listdir('/proc')
    except OSError:
        return parents
    for entry in entries:
        if not entry.isdigit():
            continue
        try:
            content = open(f'/proc/{entry}/stat', 'r', encoding='utf-8').read()
            tail = content.rsplit(')', 1)[1].strip().split()
            parents[int(entry)] = int(tail[1])
        except (OSError, ValueError, IndexError):
            continue
    return parents


def descendants(root_pid: int) -> list[int]:
    parents = _process_parents()
    children: dict[int, list[int]] = {}
    for pid, parent in parents.items():
        children.setdefault(parent, []).append(pid)
    result: list[int] = []
    pending = [root_pid]
    seen = set()
    while pending:
        parent = pending.pop()
        if parent in seen:
            continue
        seen.add(parent)
        result.append(parent)
        pending.extend(children.get(parent, []))
    return result


def _signal_many(pids: Iterable[int], signum: int) -> None:
    for pid in pids:
        if pid <= 1 or pid == os.getpid():
            continue
        try:
            os.kill(pid, signum)
        except (ProcessLookupError, PermissionError):
            pass


def close_inherited_parent_fds() -> None:
    try:
        entries = [int(entry) for entry in os.listdir('/proc/self/fd') if entry.isdigit()]
    except OSError:
        entries = list(range(3, 256))
    for fd in entries:
        if fd <= 2:
            continue
        try:
            os.close(fd)
        except OSError:
            pass


def terminate_tree(root_pid: int) -> None:
    first = descendants(root_pid)
    _signal_many(reversed(first), signal.SIGTERM)
    deadline = time.monotonic() + 0.75
    while time.monotonic() < deadline:
        alive = [pid for pid in descendants(root_pid) if os.path.exists(f'/proc/{pid}')]
        if not alive:
            return
        time.sleep(0.05)
    _signal_many(reversed(descendants(root_pid)), signal.SIGKILL)


def wait_status_to_exit_code(status: int) -> int:
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    if os.WIFSIGNALED(status):
        return 128 + os.WTERMSIG(status)
    return 1


def main(argv: list[str]) -> int:
    expected_parent_pid, ready_fd, command = parse_arguments(argv)
    arm_parent_death_signal(expected_parent_pid)
    try:
        _prctl(PR_SET_CHILD_SUBREAPER, 1)
    except OSError:
        pass

    child_pid = 0
    shutting_down = False

    def stop_tree(_signum: int, _frame: object) -> None:
        nonlocal shutting_down
        if shutting_down:
            return
        shutting_down = True
        if child_pid > 1:
            terminate_tree(child_pid)

    for signum in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, stop_tree)

    child_pid = os.fork()
    if child_pid == 0:
        try:
            os.execv(command[0], command)
        except OSError as error:
            print(f'process guard could not execute {command[0]}: {error}', file=sys.stderr)
            os._exit(127)

    if os.getppid() != expected_parent_pid:
        stop_tree(signal.SIGTERM, None)
        raise RuntimeError('Parent process exited while guarded command was starting')
    if ready_fd is not None:
        os.write(ready_fd, b'READY\n')
        os.close(ready_fd)
    close_inherited_parent_fds()

    while True:
        try:
            waited_pid, status = os.waitpid(child_pid, 0)
            if waited_pid == child_pid:
                return wait_status_to_exit_code(status)
        except InterruptedError:
            continue
        except ChildProcessError:
            return 143 if shutting_down else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main(sys.argv))
    except (OSError, RuntimeError) as error:
        print(f'process guard failed: {error}', file=sys.stderr)
        raise SystemExit(70) from error
