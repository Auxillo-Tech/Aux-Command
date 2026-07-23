#!/usr/bin/env python3
"""Small Telnet/TCP bridge for Aux Command.

Uses only Python stdlib. It forwards terminal stdin/stdout to a TCP endpoint and
handles basic Telnet option negotiation defensively so common telnet servers do
not block on WILL/WONT/DO/DONT exchanges.
"""

from __future__ import annotations

import argparse
import errno
import os
import selectors
import signal
import socket
import sys
from typing import Any

MAX_IO_CHUNK = 65_536
IAC = 255
DONT = 254
DO = 253
WONT = 252
WILL = 251
SB = 250
SE = 240


def set_nonblocking(fd: int) -> None:
    import fcntl
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


def escape_iac(data: bytes) -> bytes:
    return data.replace(bytes([IAC]), bytes([IAC, IAC]))


def strip_telnet_and_build_replies(data: bytes) -> tuple[bytes, bytes]:
    output = bytearray()
    replies = bytearray()
    index = 0
    while index < len(data):
        byte = data[index]
        if byte != IAC:
            output.append(byte)
            index += 1
            continue
        index += 1
        if index >= len(data):
            break
        command = data[index]
        index += 1
        if command == IAC:
            output.append(IAC)
        elif command in (DO, DONT, WILL, WONT):
            if index >= len(data):
                break
            option = data[index]
            index += 1
            if command in (DO, DONT):
                replies.extend([IAC, WONT, option])
            else:
                replies.extend([IAC, DONT, option])
        elif command == SB:
            while index < len(data):
                if data[index] == IAC and index + 1 < len(data) and data[index + 1] == SE:
                    index += 2
                    break
                index += 1
        else:
            # NOP, GA, AYT, etc. are ignored for this terminal bridge.
            pass
    return bytes(output), bytes(replies)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Aux Command telnet bridge')
    parser.add_argument('host')
    parser.add_argument('port', type=int)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(list(sys.argv[1:] if argv is None else argv))
    stop = False

    def handle_signal(_signum: int, _frame: Any) -> None:
        nonlocal stop
        stop = True

    for sig in (signal.SIGINT, signal.SIGHUP, signal.SIGTERM):
        signal.signal(sig, handle_signal)

    sock = socket.create_connection((args.host, args.port), timeout=15)
    sock.setblocking(False)
    set_nonblocking(sys.stdin.fileno())

    selector = selectors.DefaultSelector()
    selector.register(sock, selectors.EVENT_READ, 'socket')
    selector.register(sys.stdin.fileno(), selectors.EVENT_READ, 'stdin')
    try:
        while not stop:
            try:
                events = selector.select(timeout=0.1)
            except InterruptedError:
                continue
            for key, _mask in events:
                if key.data == 'socket':
                    try:
                        data = sock.recv(MAX_IO_CHUNK)
                    except BlockingIOError:
                        continue
                    except OSError as exc:
                        if exc.errno in (errno.EBADF, errno.ECONNRESET):
                            return 0
                        raise
                    if not data:
                        return 0
                    output, replies = strip_telnet_and_build_replies(data)
                    if replies:
                        sock.sendall(replies)
                    if output:
                        write_all(sys.stdout.fileno(), output)
                elif key.data == 'stdin':
                    try:
                        data = os.read(sys.stdin.fileno(), MAX_IO_CHUNK)
                    except BlockingIOError:
                        continue
                    if not data:
                        return 0
                    sock.sendall(escape_iac(data))
    finally:
        selector.close()
        sock.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
