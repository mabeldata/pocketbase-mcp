#!/usr/bin/env python3
"""
Download + extract helper for the PocketBase binary (used by tests/integration/setup.ts).

Usage: python3 fetch-pocketbase.py <version> <cache_dir>
Prints the absolute path of the binary on success (last line "BIN=<path>").

Cache layout: <cache_dir>/pocketbase_<version>_<os>_<arch>/pocketbase[.exe]
Supported: linux amd64/arm64, darwin amd64/arm64 (GitHub release assets).
Uses only the stdlib; `unzip` is used when available, otherwise zipfile.
"""
import os
import platform
import stat
import sys
import urllib.request
import zipfile

def main() -> int:
    version = sys.argv[1] if len(sys.argv) > 1 else "v0.40.3"
    cache_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser("~/.cache/pocketbase-mcp-tests")
    ver = version.lstrip("v")

    system = platform.system().lower()   # linux | darwin
    machine = platform.machine().lower() # x86_64 | amd64 | arm64 | aarch64
    if machine in ("x86_64", "amd64"):
        arch = "amd64"
    elif machine in ("arm64", "aarch64"):
        arch = "arm64"
    else:
        print(f"UNSUPPORTED_ARCH={machine}", file=sys.stderr)
        return 2
    if system not in ("linux", "darwin"):
        print(f"UNSUPPORTED_OS={system}", file=sys.stderr)
        return 2

    dest_dir = os.path.join(cache_dir, f"pocketbase_{ver}_{system}_{arch}")
    exe = "pocketbase.exe" if system == "windows" else "pocketbase"
    dest_bin = os.path.join(dest_dir, exe)
    if os.path.exists(dest_bin):
        print(f"BIN={dest_bin}")
        return 0

    os.makedirs(dest_dir, exist_ok=True)
    url = (
        "https://github.com/pocketbase/pocketbase/releases/download/"
        f"{version}/pocketbase_{ver}_{system}_{arch}.zip"
    )
    zip_path = os.path.join(dest_dir, "pb.zip")
    print(f"downloading {url}", file=sys.stderr)
    try:
        urllib.request.urlretrieve(url, zip_path)
    except Exception as exc:  # network unavailable etc.
        print(f"DOWNLOAD_FAILED: {exc}", file=sys.stderr)
        return 3

    try:
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(dest_dir)
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)

    if not os.path.exists(dest_bin):
        print(f"EXTRACT_MISSING_BINARY: {dest_bin}", file=sys.stderr)
        return 4
    os.chmod(dest_bin, os.stat(dest_bin).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    print(f"BIN={dest_bin}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
