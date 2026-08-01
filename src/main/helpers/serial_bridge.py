#!/usr/bin/env python3
"""Raw serial bridge for Aux Command.

This intentionally uses only the Python standard library so serial sessions do
not depend on distro-specific terminal clients such as picocom. It opens a TTY
path, configures raw mode and baud rate, then shuttles bytes between fd 0/1 and
the serial device.

The bridge runs as the child of the Aux Command PTY bridge, so fd 0 is a PTY
slave. That slave must be switched to raw mode here: otherwise the kernel line
discipline stays canonical, which line-buffers input, double-echoes every
keystroke and turns Ctrl+C into a bridge-killing SIGINT instead of a byte for
the device.
"""

from __future__ import annotations

import argparse
import errno
import fcntl
import os
import selectors
import signal
import struct
import sys
import termios
import tty
from typing import Any

MAX_IO_CHUNK = 65_536
# Stop reading terminal input when this much is queued for a slow device.
MAX_PENDING_OUTPUT = 1_048_576

BAUD_RATES = {
    50: termios.B50,
    75: termios.B75,
    110: termios.B110,
    134: termios.B134,
    150: termios.B150,
    200: termios.B200,
    300: termios.B300,
    600: termios.B600,
    1200: termios.B1200,
    1800: termios.B1800,
    2400: termios.B2400,
    4800: termios.B4800,
    9600: termios.B9600,
    19200: termios.B19200,
    38400: termios.B38400,
    57600: termios.B57600,
    115200: termios.B115200,
    230400: getattr(termios, 'B230400', None),
    460800: getattr(termios, 'B460800', None),
    500000: getattr(termios, 'B500000', None),
    576000: getattr(termios, 'B576000', None),
    921600: getattr(termios, 'B921600', None),
    1000000: getattr(termios, 'B1000000', None),
    1152000: getattr(termios, 'B1152000', None),
    1500000: getattr(termios, 'B1500000', None),
    2000000: getattr(termios, 'B2000000', None),
    2500000: getattr(termios, 'B2500000', None),
    3000000: getattr(termios, 'B3000000', None),
    3500000: getattr(termios, 'B3500000', None),
    4000000: getattr(termios, 'B4000000', None),
}

# Linux ioctl interface for non-standard baud rates (struct termios2 + BOTHER).
TCGETS2 = 0x802C542A
TCSETS2 = 0x402C542B
BOTHER = 0o010000
CBAUD = 0o010017
TERMIOS2_FORMAT = '4I20B2I'


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


def configure_custom_baud(fd: int, baud: int) -> None:
    """Program an arbitrary baud rate through the Linux termios2/BOTHER ioctl."""
    raw = fcntl.ioctl(fd, TCGETS2, struct.pack(TERMIOS2_FORMAT, *([0] * 26)))
    fields = list(struct.unpack(TERMIOS2_FORMAT, raw))
    fields[2] = (fields[2] & ~CBAUD) | BOTHER
    fields[24] = baud
    fields[25] = baud
    fcntl.ioctl(fd, TCSETS2, struct.pack(TERMIOS2_FORMAT, *fields))


def configure_serial(fd: int, baud: int) -> None:
    if baud < 50 or baud > 4_000_000:
        raise ValueError(f'Serial baud rate out of range (50-4000000): {baud}')
    attrs = termios.tcgetattr(fd)
    speed = BAUD_RATES.get(baud)

    # iflag, oflag, cflag, lflag, ispeed, ospeed, cc
    attrs[0] = 0
    attrs[1] = 0
    attrs[2] = attrs[2] | termios.CLOCAL | termios.CREAD
    attrs[2] = attrs[2] & ~termios.CSIZE
    attrs[2] = attrs[2] | termios.CS8
    attrs[2] = attrs[2] & ~termios.PARENB
    attrs[2] = attrs[2] & ~termios.CSTOPB
    attrs[2] = attrs[2] & ~getattr(termios, 'CRTSCTS', 0)
    attrs[3] = 0
    attrs[4] = speed if speed is not None else termios.B38400
    attrs[5] = speed if speed is not None else termios.B38400
    attrs[6][termios.VMIN] = 1
    attrs[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, attrs)

    if speed is None:
        try:
            configure_custom_baud(fd, baud)
        except OSError as exc:
            supported = ', '.join(str(rate) for rate, value in sorted(BAUD_RATES.items()) if value is not None)
            raise ValueError(
                f'The serial driver rejected the custom baud rate {baud} '
                f'({exc.strerror or exc}). Standard rates: {supported}'
            ) from exc


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Aux Command raw serial bridge')
    parser.add_argument('--baud', type=int, required=True)
    parser.add_argument('device')
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(list(sys.argv[1:] if argv is None else argv))
    if not args.device.startswith('/dev/') and not args.device.startswith('/tmp/'):
        raise ValueError('Serial device must be an absolute TTY path')

    serial_fd = os.open(args.device, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    stop = False

    def handle_signal(_signum: int, _frame: Any) -> None:
        nonlocal stop
        stop = True

    for sig in (signal.SIGHUP, signal.SIGTERM):
        signal.signal(sig, handle_signal)

    stdin_fd = sys.stdin.fileno()
    if os.isatty(stdin_fd):
        # Raw mode: no echo, no line buffering, Ctrl+C/Z become bytes for the device.
        tty.setraw(stdin_fd, termios.TCSANOW)

    pending = bytearray()  # bytes queued for the (possibly slow) serial device
    stdin_paused = False

    try:
        configure_serial(serial_fd, args.baud)
        set_nonblocking(stdin_fd)
        selector = selectors.DefaultSelector()
        selector.register(serial_fd, selectors.EVENT_READ, 'serial')
        selector.register(stdin_fd, selectors.EVENT_READ, 'stdin')

        def update_serial_interest() -> None:
            events = selectors.EVENT_READ | (selectors.EVENT_WRITE if pending else 0)
            selector.modify(serial_fd, events, 'serial')

        def flush_pending() -> None:
            nonlocal stdin_paused
            while pending:
                try:
                    written = os.write(serial_fd, pending[:MAX_IO_CHUNK])
                except BlockingIOError:
                    break
                except InterruptedError:
                    continue
                del pending[:written]
            update_serial_interest()
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
                    if key.data == 'serial':
                        if mask & selectors.EVENT_WRITE:
                            flush_pending()
                        if mask & selectors.EVENT_READ:
                            try:
                                data = os.read(serial_fd, MAX_IO_CHUNK)
                            except BlockingIOError:
                                continue
                            except OSError as exc:
                                if exc.errno in (errno.EIO, errno.EBADF):
                                    return 0
                                raise
                            if data:
                                write_all(sys.stdout.fileno(), data)
                    elif key.data == 'stdin':
                        try:
                            data = os.read(stdin_fd, MAX_IO_CHUNK)
                        except BlockingIOError:
                            continue
                        if not data:
                            return 0
                        pending.extend(data)
                        flush_pending()
                        if len(pending) >= MAX_PENDING_OUTPUT and not stdin_paused:
                            selector.unregister(stdin_fd)
                            stdin_paused = True
        finally:
            selector.close()
    finally:
        os.close(serial_fd)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError) as exc:
        sys.stderr.write(f'Aux Command serial bridge: {exc}\r\n')
        raise SystemExit(1)
