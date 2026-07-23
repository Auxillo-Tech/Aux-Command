#!/usr/bin/env python3
"""Raw serial bridge for Aux Command.

This intentionally uses only the Python standard library so serial sessions do
not depend on distro-specific terminal clients such as picocom. It opens a TTY
path, configures raw mode and baud rate, then shuttles bytes between fd 0/1 and
the serial device.
"""

from __future__ import annotations

import argparse
import errno
import os
import selectors
import signal
import sys
import termios
from typing import Any

MAX_IO_CHUNK = 65_536

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
    230400: getattr(termios, 'B230400', termios.B115200),
    460800: getattr(termios, 'B460800', termios.B115200),
    921600: getattr(termios, 'B921600', termios.B115200),
}


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


def configure_serial(fd: int, baud: int) -> None:
    attrs = termios.tcgetattr(fd)
    speed = BAUD_RATES.get(baud)
    if speed is None:
        raise ValueError(f'Unsupported serial baud rate: {baud}')

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
    attrs[4] = speed
    attrs[5] = speed
    attrs[6][termios.VMIN] = 1
    attrs[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, attrs)


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

    for sig in (signal.SIGINT, signal.SIGHUP, signal.SIGTERM):
        signal.signal(sig, handle_signal)

    try:
        configure_serial(serial_fd, args.baud)
        set_nonblocking(sys.stdin.fileno())
        selector = selectors.DefaultSelector()
        selector.register(serial_fd, selectors.EVENT_READ, 'serial')
        selector.register(sys.stdin.fileno(), selectors.EVENT_READ, 'stdin')
        try:
            while not stop:
                try:
                    events = selector.select(timeout=0.1)
                except InterruptedError:
                    continue
                for key, _mask in events:
                    if key.data == 'serial':
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
                            data = os.read(sys.stdin.fileno(), MAX_IO_CHUNK)
                        except BlockingIOError:
                            continue
                        if not data:
                            return 0
                        write_all(serial_fd, data)
        finally:
            selector.close()
    finally:
        os.close(serial_fd)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
