#!/usr/bin/env python3
"""
Generic SSH runner — host/user/password supplied via env vars or argv.

Usage:
    SSH_HOST=203.0.113.10 SSH_USER=foo SSH_PASS='bar' \
        python .tools/ssh_remote.py "uname -a"

    python .tools/ssh_remote.py --host 203.0.113.10 --user foo --pass 'bar' "uname -a"

    # Use stdin for the command (handles multi-line):
    cat my-script.sh | SSH_HOST=... SSH_USER=... SSH_PASS=... \
        python .tools/ssh_remote.py --stdin

    # sudo:
    SSH_HOST=... SSH_USER=... SSH_PASS=... \
        python .tools/ssh_remote.py --sudo "ls /root"

This tool is the multi-host successor to .tools/ssh_run.py (which has the
β VM creds hard-coded). Keep it generic — secrets via env, never argv when
they could be persisted in shell history.
"""

from __future__ import annotations

import argparse
import io
import os
import shlex
import sys

import paramiko


def run(
    host: str,
    user: str,
    password: str | None,
    key_path: str | None,
    port: int,
    cmd: str,
    use_sudo: bool,
    sudo_nopasswd: bool,
    timeout: int,
) -> int:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    connect_kwargs: dict[str, object] = {
        "hostname": host,
        "port": port,
        "username": user,
        "timeout": 15,
        "banner_timeout": 15,
        "auth_timeout": 15,
    }
    if key_path:
        connect_kwargs["key_filename"] = os.path.expanduser(key_path)
        connect_kwargs["allow_agent"] = False
        connect_kwargs["look_for_keys"] = False
    else:
        connect_kwargs["password"] = password
        connect_kwargs["allow_agent"] = False
        connect_kwargs["look_for_keys"] = False

    client.connect(**connect_kwargs)

    if use_sudo and sudo_nopasswd:
        full = f"sudo bash -lc {shlex.quote(cmd)}"
        stdin, stdout, stderr = client.exec_command(full, timeout=timeout)
    elif use_sudo:
        full = f"sudo -S -p '' bash -lc {shlex.quote(cmd)}"
        stdin, stdout, stderr = client.exec_command(full, get_pty=True, timeout=timeout)
        stdin.write((password or "") + "\n")
        stdin.flush()
    else:
        stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)

    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()

    if out:
        sys.stdout.write(out)
    if err:
        sys.stderr.write(err)
    client.close()
    return code


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("SSH_HOST"))
    parser.add_argument("--user", default=os.environ.get("SSH_USER"))
    parser.add_argument("--pass", dest="password", default=os.environ.get("SSH_PASS"))
    parser.add_argument("--key", dest="key_path", default=os.environ.get("SSH_KEY"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("SSH_PORT", "22")))
    parser.add_argument("--sudo", action="store_true")
    parser.add_argument(
        "--sudo-nopasswd",
        action="store_true",
        help="sudo without -S/password prompt (user has NOPASSWD)",
    )
    parser.add_argument("--stdin", action="store_true", help="Read command from stdin")
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("cmd", nargs="?", default="")
    args = parser.parse_args()

    if not args.host or not args.user:
        sys.stderr.write("missing required args: --host and --user\n")
        return 2
    if not args.key_path and not args.password:
        sys.stderr.write("missing auth: provide --key (or SSH_KEY) or --pass (or SSH_PASS)\n")
        return 2

    if args.stdin:
        cmd = sys.stdin.read()
    else:
        cmd = args.cmd
    if not cmd:
        sys.stderr.write("empty command\n")
        return 2

    return run(
        args.host,
        args.user,
        args.password,
        args.key_path,
        args.port,
        cmd,
        args.sudo,
        args.sudo_nopasswd,
        args.timeout,
    )


if __name__ == "__main__":
    sys.exit(main())
