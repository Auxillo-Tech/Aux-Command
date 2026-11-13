#!/usr/bin/env python3
"""OpenSSH askpass helper for Aux Command.

OpenSSH starts this program (SSH_ASKPASS) with the prompt text as its only
argument and reads the answer from standard output. The helper never holds a
secret of its own: it sends the prompt to the private Unix socket of the Aux
Command process that started this ssh and prints the reply. The environment
carries only the socket path and a random token for that one ssh process.

Replies:
  answer    print the value; OpenSSH uses it
  terminal  ask on the controlling terminal, exactly where OpenSSH would have
  deny      exit non-zero so OpenSSH treats the prompt as unanswered
"""

from __future__ import annotations

import json
import os
import socket
import sys
import termios

SOCKET_ENV = "AUX_COMMAND_ASKPASS_SOCKET"
TOKEN_ENV = "AUX_COMMAND_ASKPASS_TOKEN"
MAX_PROMPT_CHARS = 8192
MAX_REPLY_BYTES = 16_384
# OpenSSH reads at most 1023 bytes of answer and stops at the first line end.
MAX_ANSWER_BYTES = 1000
CONNECT_TIMEOUT_SECONDS = 5
# The application answers within its own dialog timeout; this is the backstop.
REPLY_TIMEOUT_SECONDS = 180


def request_reply(path: str, token: str, prompt: str) -> dict:
    message = json.dumps({"token": token, "prompt": prompt, "pid": os.getppid()}).encode("utf-8") + b"\n"
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(CONNECT_TIMEOUT_SECONDS)
        client.connect(path)
        client.sendall(message)
        client.settimeout(REPLY_TIMEOUT_SECONDS)
        received = bytearray()
        while b"\n" not in received:
            chunk = client.recv(4096)
            if not chunk:
                break
            received.extend(chunk)
            if len(received) > MAX_REPLY_BYTES:
                raise ValueError("reply is too large")
    line = bytes(received).split(b"\n", 1)[0]
    reply = json.loads(line.decode("utf-8"))
    if not isinstance(reply, dict):
        raise ValueError("reply is not an object")
    return reply


def ask_terminal(prompt: str, echo: bool) -> str:
    """Ask on the controlling terminal the way OpenSSH does without askpass."""
    fd = os.open("/dev/tty", os.O_RDWR | os.O_NOCTTY)
    saved = None
    try:
        if not echo:
            saved = termios.tcgetattr(fd)
            hidden = termios.tcgetattr(fd)
            hidden[3] &= ~(termios.ECHO | termios.ECHONL)
            termios.tcsetattr(fd, termios.TCSAFLUSH, hidden)
        os.write(fd, b"\r" + prompt.encode("utf-8", "surrogateescape"))
        answer = bytearray()
        while len(answer) <= MAX_ANSWER_BYTES:
            byte = os.read(fd, 1)
            if not byte or byte in (b"\n", b"\r"):
                break
            answer.extend(byte)
        if not echo:
            os.write(fd, b"\n")
        return answer.decode("utf-8", "surrogateescape")
    finally:
        if saved is not None:
            termios.tcsetattr(fd, termios.TCSAFLUSH, saved)
        os.close(fd)


def emit(answer: str) -> int:
    data = answer.encode("utf-8", "surrogateescape")
    if len(data) > MAX_ANSWER_BYTES or b"\n" in data or b"\r" in data or b"\x00" in data:
        return 1
    os.write(sys.stdout.fileno(), data + b"\n")
    return 0


def main(argv: list[str]) -> int:
    path = os.environ.get(SOCKET_ENV, "")
    token = os.environ.get(TOKEN_ENV, "")
    prompt = argv[1] if len(argv) > 1 else ""
    # A notification (for example "touch your security key") expects no answer.
    if os.environ.get("SSH_ASKPASS_PROMPT", "") == "none":
        return 0
    if not path or not token or len(prompt) > MAX_PROMPT_CHARS:
        return 1
    reply = request_reply(path, token, prompt)
    action = reply.get("action")
    if action == "answer" and isinstance(reply.get("value"), str):
        return emit(reply["value"])
    if action == "terminal":
        return emit(ask_terminal(prompt, bool(reply.get("echo"))))
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv))
    except SystemExit:
        raise
    except BaseException:
        # Nothing is printed: an error text must never be mistaken for an answer.
        raise SystemExit(1)
