#!/usr/bin/env python3
"""Small Telnet/TCP bridge for Aux Command.

Uses only Python stdlib. It forwards terminal stdin/stdout to a TCP endpoint and
handles basic Telnet option negotiation defensively so common telnet servers do
not block on WILL/WONT/DO/DONT exchanges.

The bridge runs as the child of the Aux Command PTY bridge, so fd 0 is a PTY
slave. That slave is switched to raw mode here so keystrokes (including Ctrl+C)
reach the remote server as bytes, passwords are not locally echoed, and input is
not line-buffered.
"""

from __future__ import annotations

import argparse
import errno
import fcntl
import os
import selectors
import signal
import socket
import sys
import termios
import tty
from typing import Any

MAX_IO_CHUNK = 65_536
# Stop reading terminal input when this much is queued for a congested socket.
MAX_PENDING_OUTPUT = 1_048_576

IAC = 255
DONT = 254
DO = 253
WONT = 252
WILL = 251
SB = 250
SE = 240


def set_nonblocking(fd: int) -> None:
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)


def write_all(fd: int, data: bytes) -> None:
    """Blocking-fd write helper used for stdout only."""
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


class TelnetParser:
    """Incremental Telnet stream parser.

    Telnet commands routinely straddle recv() boundaries, so the parser keeps
    its position in a partially received IAC sequence between feed() calls.
    """

    STATE_DATA = 0
    STATE_IAC = 1
    STATE_OPTION = 2
    STATE_SB = 3
    STATE_SB_IAC = 4

    def __init__(self) -> None:
        self.state = self.STATE_DATA
        self.pending_command = 0

    def feed(self, data: bytes) -> tuple[bytes, bytes]:
        output = bytearray()
        replies = bytearray()
        for byte in data:
            if self.state == self.STATE_DATA:
                if byte == IAC:
                    self.state = self.STATE_IAC
                else:
                    output.append(byte)
            elif self.state == self.STATE_IAC:
                if byte == IAC:
                    output.append(IAC)
                    self.state = self.STATE_DATA
                elif byte in (DO, DONT, WILL, WONT):
                    self.pending_command = byte
                    self.state = self.STATE_OPTION
                elif byte == SB:
                    self.state = self.STATE_SB
                else:
                    # NOP, GA, AYT, etc. are ignored for this terminal bridge.
                    self.state = self.STATE_DATA
            elif self.state == self.STATE_OPTION:
                if self.pending_command in (DO, DONT):
                    replies.extend([IAC, WONT, byte])
                else:
                    replies.extend([IAC, DONT, byte])
                self.pending_command = 0
                self.state = self.STATE_DATA
            elif self.state == self.STATE_SB:
                if byte == IAC:
                    self.state = self.STATE_SB_IAC
            elif self.state == self.STATE_SB_IAC:
                if byte == SE:
                    self.state = self.STATE_DATA
                elif byte == IAC:
                    self.state = self.STATE_SB  # escaped 255 inside subnegotiation
                else:
                    self.state = self.STATE_SB
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

    for sig in (signal.SIGHUP, signal.SIGTERM):
        signal.signal(sig, handle_signal)

    sock = socket.create_connection((args.host, args.port), timeout=15)
    sock.setblocking(False)

    stdin_fd = sys.stdin.fileno()
    if os.isatty(stdin_fd):
        # Raw mode: no local echo, no line buffering, Ctrl+C reaches the server.
        tty.setraw(stdin_fd, termios.TCSANOW)
    set_nonblocking(stdin_fd)

    parser = TelnetParser()
    pending = bytearray()  # bytes queued for the socket under backpressure
    stdin_paused = False

    selector = selectors.DefaultSelector()
    selector.register(sock, selectors.EVENT_READ, 'socket')
    selector.register(stdin_fd, selectors.EVENT_READ, 'stdin')

    def update_socket_interest() -> None:
        events = selectors.EVENT_READ | (selectors.EVENT_WRITE if pending else 0)
        selector.modify(sock, events, 'socket')

    def queue_send(data: bytes) -> None:
        nonlocal stdin_paused
        pending.extend(data)
        flush_pending()
        if len(pending) >= MAX_PENDING_OUTPUT and not stdin_paused:
            selector.unregister(stdin_fd)
            stdin_paused = True

    def flush_pending() -> None:
        nonlocal stdin_paused
        while pending:
            try:
                sent = sock.send(pending[:MAX_IO_CHUNK])
            except BlockingIOError:
                break
            except InterruptedError:
                continue
            del pending[:sent]
        update_socket_interest()
        if stdin_paused and len(pending) < MAX_PENDING_OUTPUT // 2:
            selector.register(stdin_fd, selectors.EVENT_READ, 'stdin')
            stdin_paused = False

    try:
        while not stop:
            try:
                events = selector.select(timeout=0.1)
            except InterruptedError:
                continue
            for key, mask in events:
                if key.data == 'socket':
                    if mask & selectors.EVENT_WRITE:
                        flush_pending()
                    if mask & selectors.EVENT_READ:
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
                        output, replies = parser.feed(data)
                        if replies:
                            queue_send(replies)
                        if output:
                            write_all(sys.stdout.fileno(), output)
                elif key.data == 'stdin':
                    try:
                        data = os.read(stdin_fd, MAX_IO_CHUNK)
                    except BlockingIOError:
                        continue
                    if not data:
                        return 0
                    queue_send(escape_iac(data))
    finally:
        selector.close()
        sock.close()
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError) as exc:
        sys.stderr.write(f'Aux Command telnet bridge: {exc}\r\n')
        raise SystemExit(1)
