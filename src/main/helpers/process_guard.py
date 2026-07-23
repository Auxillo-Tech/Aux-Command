#!/usr/bin/env python3
"""Exec a child command that dies if its exact direct parent disappears."""

from __future__ import annotations

import ctypes
import errno
import os
import signal
import sys

PR_SET_PDEATHSIG = 1


def arm_parent_death_signal(expected_parent_pid: int, signum: int = signal.SIGKILL) -> None:
    if expected_parent_pid <= 1 or os.getppid() != expected_parent_pid:
        raise RuntimeError('Expected parent process is no longer present')
    libc = ctypes.CDLL(None, use_errno=True)
    result = libc.prctl(PR_SET_PDEATHSIG, signum, 0, 0, 0)
    if result != 0:
        code = ctypes.get_errno() or errno.EINVAL
        raise OSError(code, os.strerror(code))
    if os.getppid() != expected_parent_pid:
        raise RuntimeError('Parent process exited before guard activation')


def parse_arguments(argv: list[str]) -> tuple[int, int, list[str]]:
    if len(argv) < 6 or argv[1] != '--parent-pid':
        raise RuntimeError('usage: process_guard.py --parent-pid PID [--ready-fd FD] -- COMMAND [ARG ...]')
    try:
        expected_parent_pid = int(argv[2])
    except ValueError as error:
        raise RuntimeError('Invalid expected parent PID') from error
    index = 3
    ready_fd = 3
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


def main(argv: list[str]) -> int:
    expected_parent_pid, ready_fd, command = parse_arguments(argv)
    arm_parent_death_signal(expected_parent_pid)
    os.write(ready_fd, b'READY\n')
    os.close(ready_fd)
    os.execv(command[0], command)
    return 127


if __name__ == '__main__':
    try:
        raise SystemExit(main(sys.argv))
    except (OSError, RuntimeError) as error:
        print(f'process guard failed: {error}', file=sys.stderr)
        raise SystemExit(70) from error
