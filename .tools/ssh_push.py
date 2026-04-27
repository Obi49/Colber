#!/usr/bin/env python3
"""SFTP push: copy local dir/file tree to remote dir on AgentStack VM.
Uses SSH to pre-create directory tree, then SFTP put for files only."""
import sys
import io
import os
from pathlib import Path
import paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

HOST = "100.83.10.125"
USER = "claude"
PASS = "claude123"
PORT = 22

def collect_files(local: Path):
    if local.is_file():
        yield local, local.name
        return
    for root, _, files in os.walk(local):
        rel_root = Path(root).relative_to(local).as_posix()
        for f in files:
            lp = Path(root) / f
            rel = f if rel_root == "." else f"{rel_root}/{f}"
            yield lp, rel

def upload(local: Path, remote: str) -> int:
    files = list(collect_files(local))
    dirs = sorted({os.path.dirname(rel) for _, rel in files if os.path.dirname(rel)})

    # 1) Pre-create remote tree via SSH
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASS,
                timeout=15, allow_agent=False, look_for_keys=False)
    mkdirs = " ".join(["'" + remote + "'"] + ["'" + remote + "/" + d + "'" for d in dirs])
    stdin, stdout, stderr = ssh.exec_command(f"mkdir -p {mkdirs}")
    rc = stdout.channel.recv_exit_status()
    if rc != 0:
        sys.stderr.write(stderr.read().decode("utf-8", errors="replace"))
        ssh.close()
        return rc

    # 2) Open SFTP and put files
    sftp = ssh.open_sftp()
    count = 0
    for lp, rel in files:
        remote_path = f"{remote}/{rel}"
        sftp.put(str(lp), remote_path)
        print(f"  PUT {lp} -> {remote_path}")
        count += 1
    sftp.close()
    ssh.close()
    print(f"Uploaded {count} file(s)")
    return 0

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: ssh_push.py <local> <remote>", file=sys.stderr)
        sys.exit(2)
    local = Path(sys.argv[1])
    remote = sys.argv[2]
    if not local.exists():
        print(f"local not found: {local}", file=sys.stderr)
        sys.exit(2)
    sys.exit(upload(local, remote))
