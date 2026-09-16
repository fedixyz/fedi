"""Prepare host dependencies for a new local worktree on APFS."""
import ctypes
import fcntl
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import time

MAX_BYTES = 16 * 1024**3
MAX_FILES = 100_000
MAX_SECONDS = 30


def run(*args, cwd, env=None, timeout=60):
    return subprocess.check_output(args, cwd=cwd, env=env, text=True,
                                   stderr=subprocess.PIPE, timeout=timeout).strip()


def matching_inputs(a, b):
    for name in ("Cargo.lock", "flake.lock", "flake.nix", ".cargo/config", ".cargo/config.toml"):
        left, right = a / name, b / name
        if left.exists() != right.exists():
            return False
        if left.is_file() and left.read_bytes() != right.read_bytes():
            return False
    return True


def files_to_clone(source, deadline):
    files, total = [], 0
    for name in ("deps", "build", ".fingerprint"):
        directory = source / name
        if directory.is_symlink():
            raise ValueError(f"symlink in build directory: {directory}")
        for parent, dirs, names in os.walk(directory):
            for entry in dirs + names:
                path = Path(parent) / entry
                info = path.lstat()
                if stat.S_ISDIR(info.st_mode):
                    continue
                if not stat.S_ISREG(info.st_mode):
                    raise ValueError(f"unsupported build entry: {path}")
                total += info.st_size
                files.append(path.relative_to(source))
                if total > MAX_BYTES or len(files) > MAX_FILES or time.monotonic() > deadline:
                    raise ValueError("donor exceeds the preparation budget")
    return files


def clone_files(source, destination, files, deadline):
    libc = ctypes.CDLL(None, use_errno=True)
    for relative in files:
        if time.monotonic() > deadline:
            raise ValueError("preparation time limit reached")
        src, dst = source / relative, destination / relative
        dst.parent.mkdir(parents=True, exist_ok=True)
        if libc.clonefile(os.fsencode(src), os.fsencode(dst), 0):
            raise OSError(ctypes.get_errno(), "APFS clone failed; no full-copy fallback")
        os.chflags(dst, 0)
        dst.chmod(stat.S_IMODE(src.stat().st_mode) | stat.S_IWUSR)


def publish(source, destination):
    # RENAME_EXCL prevents overwriting a target created by a concurrent Cargo process.
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.renamex_np(os.fsencode(source), os.fsencode(destination), 4):
        raise OSError(ctypes.get_errno(), "target appeared during preparation")


def prepare(root):
    if sys.platform != "darwin" or os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
        return
    if os.environ.get("FEDI_WORKTREE_CACHE") == "0" or os.environ.get("CARGO_BUILD_BUILD_DIR"):
        return
    target = root / "target-nix"
    if target.is_symlink():
        return
    listing = run("git", "worktree", "list", "--porcelain", "-z", cwd=root)
    candidates = [Path(line.removeprefix("worktree ")) for line in listing.split("\0")
                  if line.startswith("worktree ")]
    target.mkdir(exist_ok=True)
    with (target / ".worktree-cache.lock").open("a") as destination_lock:
        try:
            fcntl.flock(destination_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        for partial in target.glob(".worktree-cache-*"):
            if partial.is_dir() and not partial.is_symlink():
                shutil.rmtree(partial)
        if (target / "debug").exists():
            return
        deadline = time.monotonic() + MAX_SECONDS
        for donor in candidates:
            if time.monotonic() > deadline:
                break
            source = donor / "target-nix" / "debug"
            if donor == root or source.resolve() != source or not (source / ".cargo-lock").is_file():
                continue
            if not matching_inputs(root, donor):
                continue
            try:
                with (source / ".cargo-lock").open("r") as source_lock:
                    fcntl.flock(source_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    files = files_to_clone(source, deadline)
                    if not files:
                        continue
                    with tempfile.TemporaryDirectory(prefix=".worktree-cache-", dir=target) as temporary:
                        staging = Path(temporary) / "target"
                        staged_debug = staging / "debug"
                        staged_debug.mkdir(parents=True)
                        clone_files(source, staged_debug, files, deadline)
                        fcntl.flock(source_lock, fcntl.LOCK_UN)
                        env = os.environ | {"CARGO_TARGET_DIR": str(staging),
                                            "CARGO_BUILD_TARGET_DIR": str(staging),
                                            "CARGO_BUILD_BUILD_DIR": str(staging)}
                        metadata = json.loads(run("cargo", "metadata", "--offline", "--locked",
                                                  "--all-features", "--format-version=1", cwd=root, env=env,
                                                  timeout=max(1, deadline - time.monotonic())))
                        local = [p for p in metadata["packages"] if p["source"] is None]
                        command = ["cargo", "clean", "--offline", "--target-dir", str(staging)]
                        for package in local:
                            command += ["-p", package["id"]]
                        if not local:
                            raise ValueError("no local packages found")
                        # Local sources may differ even when their mtimes match.
                        run(*command, cwd=root, env=env, timeout=max(1, deadline - time.monotonic()))
                        publish(staged_debug, target / "debug")
                print(f"worktree cache: reused host dependencies from {donor}", file=sys.stderr)
                return
            except BlockingIOError:
                continue
            except (OSError, ValueError, subprocess.SubprocessError) as error:
                print(f"worktree cache: skipped {donor}: {error}", file=sys.stderr)


if __name__ == "__main__":
    try:
        prepare(Path(run("git", "rev-parse", "--show-toplevel", cwd=Path.cwd())).resolve())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"worktree cache: unavailable, cargo will build normally: {error}", file=sys.stderr)
