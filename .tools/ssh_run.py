#!/usr/bin/env python3
"""SSH runner for AgentStack VM. Reads command from argv, prints stdout/stderr/exit."""
import sys
import io
import paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

HOST = "100.83.10.125"
USER = "claude"
PASS = "claude123"
PORT = 22

def run(cmd: str, use_sudo: bool = False, sudo_pass: str | None = None) -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASS,
                   timeout=15, banner_timeout=15, auth_timeout=15,
                   allow_agent=False, look_for_keys=False)
    if use_sudo:
        full = f"sudo -S -p '' bash -lc {sh_quote(cmd)}"
        stdin, stdout, stderr = client.exec_command(full, get_pty=True, timeout=600)
        stdin.write((sudo_pass or PASS) + "\n")
        stdin.flush()
    else:
        stdin, stdout, stderr = client.exec_command(cmd, timeout=600)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    sys.stdout.write(out)
    if err:
        sys.stderr.write(err)
    client.close()
    return code

def sh_quote(s: str) -> str:
    return "'" + s.replace("'", "'\\''") + "'"

if __name__ == "__main__":
    use_sudo = False
    args = sys.argv[1:]
    if args and args[0] == "--sudo":
        use_sudo = True
        args = args[1:]
    cmd = " ".join(args) if args else "echo no-command"
    rc = run(cmd, use_sudo=use_sudo)
    sys.exit(rc)
