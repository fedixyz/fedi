"""Run with nix develop .#worktree --command python3 dev/tests/test-worktree-cache.py."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from unittest import mock

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve().parents[1] / "worktree-cache.py"
spec = importlib.util.spec_from_file_location("cache", SCRIPT)
cache = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cache)


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def command(root, *args, env=None):
    return subprocess.check_output(args, cwd=root, env=env, text=True, stderr=subprocess.PIPE)


def environment(root):
    return os.environ | {"CARGO_TARGET_DIR": str(root / "target-nix"),
                         "CARGO_BUILD_TARGET_DIR": str(root / "target-nix")}


def build(root, env=None):
    output = command(root, "cargo", "build", "--locked", "--offline", "--message-format=json",
                     env=env or environment(root))
    return [json.loads(line) for line in output.splitlines()
            if json.loads(line).get("reason") == "compiler-artifact"]


def inventory(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in root.rglob("*") if p.is_file()}


def main():
    if sys.platform != "darwin" or not os.environ.get("IN_NIX_SHELL"):
        raise SystemExit("run the APFS tests inside nix develop .#worktree on macOS")
    if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
        raise SystemExit("local-only tests refuse to run in CI")
    fixtures = Path.home() / ".agents/worktrees/worktree-cache-tests"
    fixtures.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=fixtures) as temporary:
        base = Path(temporary)
        a, b, c = (base / name for name in ("a", "b", "c"))
        a.mkdir()
        command(a, "git", "init", "-q")
        write(a / ".gitignore", "target-nix/\n")
        write(a / "Cargo.toml", '[workspace]\nresolver = "2"\nmembers = ["app", "local"]\nexclude = ["external"]\n')
        write(a / "app/Cargo.toml", '''[package]
name = "worktree-probe"
version = "0.1.0"
edition = "2021"
[dependencies]
local = { path = "../local" }
itoa = "=1.0.15"
''')
        write(a / "app/src/main.rs", 'fn main() { println!("{}{}", local::value(), itoa::Buffer::new().format(7)); }')
        write(a / "local/Cargo.toml", '''[package]
name = "local"
version = "0.1.0"
edition = "2021"
[dependencies]
external = { path = "../external" }
''')
        write(a / "local/src/lib.rs", 'pub fn value() -> &\'static str { external::value() }')
        write(a / "external/Cargo.toml", '[package]\nname = "external"\nversion = "0.1.0"\nedition = "2021"\n')
        write(a / "external/src/lib.rs", 'pub fn value() -> &\'static str { "A" }')
        command(a, "cargo", "generate-lockfile", "--offline", env=environment(a))
        command(a, "cargo", "fmt", "--all", env=environment(a))
        command(a, "git", "add", ".")
        command(a, "git", "-c", "user.name=cache test", "-c", "user.email=cache-test@example.invalid",
                "commit", "-qm", "test: add cargo fixture")
        for root in (b, c):
            command(a, "git", "worktree", "add", "--detach", str(root), "HEAD")
        assert all(not item["fresh"] for item in build(a))
        print("PASS: ordinary cold build")

        with (a / "target-nix/debug/.cargo-lock").open("r") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            process = subprocess.Popen(["cargo", "build", "--locked", "--offline"], cwd=a,
                                       env=environment(a), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                time.sleep(0.5)
                assert process.poll() is None, "Cargo did not honor the donor lock"
                cache.prepare(b)
                assert not (b / "target-nix/debug").exists(), "busy donor was copied"
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)
                _, stderr = process.communicate(timeout=30)
            assert process.returncode == 0 and "Blocking waiting for file lock" in stderr
        print("PASS: actual Cargo lock excludes copying; busy donor does not block preparation")

        before = inventory(a / "target-nix")
        changed = b / "external/src/lib.rs"
        timestamp = changed.stat().st_mtime_ns
        changed.write_text(changed.read_text().replace('"A"', '"B"'))
        os.utime(changed, ns=(timestamp, timestamp))
        write(b / "target-nix/datadir/state", "keep runtime data")
        processes = [subprocess.Popen([sys.executable, str(SCRIPT)], cwd=b,
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for _ in range(2)]
        messages = [p.communicate(timeout=60)[1] for p in processes]
        assert all(p.returncode == 0 for p in processes), messages
        assert sum("reused host dependencies" in message for message in messages) == 1, messages
        assert not (b / "target-nix/debug/incremental").exists()
        assert not list((b / "target-nix/debug/deps").glob("liblocal-*"))
        assert not list((b / "target-nix/debug/deps").glob("libexternal-*"))
        original = next((a / "target-nix/debug/deps").glob("libitoa-*.rlib"))
        cloned = b / "target-nix/debug/deps" / original.name
        assert original.stat().st_ino != cloned.stat().st_ino
        assert original.read_bytes() == cloned.read_bytes()
        assert inventory(a / "target-nix") == before
        print("PASS: concurrent preparation, isolated files, unchanged donor, path packages removed")

        a.rename(base / "unavailable")
        try:
            artifacts = build(b)
            assert next(item for item in artifacts if item["target"]["name"] == "itoa")["fresh"]
            assert all(not item["fresh"] for item in artifacts if item["target"]["name"] != "itoa")
            assert command(b, str(b / "target-nix/debug/worktree-probe")).strip() == "B7"
            assert all(item["fresh"] for item in build(b))
            assert any((b / "target-nix/debug/incremental").iterdir())
            changed.write_text(changed.read_text().replace('"B"', '"C"'))
            build(b)
            assert command(b, str(b / "target-nix/debug/worktree-probe")).strip() == "C7"
            optimized = build(b, environment(b) | {"CARGO_PROFILE_DEV_OPT_LEVEL": "2"})
            assert not next(item for item in optimized if item["target"]["name"] == "itoa")["fresh"]
            assert command(b, str(b / "target-nix/debug/worktree-probe")).strip() == "C7"
        finally:
            (base / "unavailable").rename(a)
        print("PASS: dependency reuse, edited source, missing donor, warm rebuild, incremental state, profile changes")

        for variable in ("CI", "GITHUB_ACTIONS"):
            with mock.patch.dict(os.environ, {variable: "1"}):
                cache.prepare(c)
            assert not (c / "target-nix").exists()
        with mock.patch.object(cache, "MAX_BYTES", 1):
            cache.prepare(c)
        assert not (c / "target-nix/debug").exists()
        with mock.patch.object(cache, "clone_files", side_effect=OSError("unsupported filesystem")):
            cache.prepare(c)
        assert not list((c / "target-nix").glob(".worktree-cache-*"))
        partial = c / "target-nix/.worktree-cache-interrupted"
        write(partial / "junk", "interrupted clone")
        cache.prepare(c)
        assert not partial.exists()
        assert (c / "target-nix/debug").is_dir()
        assert (b / "target-nix/datadir/state").read_text() == "keep runtime data"
        print("PASS: CI guards, size budget, unsupported filesystem, interruption recovery, runtime data")

        bad = base / "bad"
        (bad / "deps").mkdir(parents=True)
        (bad / "deps/link").symlink_to(a / "Cargo.lock")
        try:
            cache.files_to_clone(bad, time.monotonic() + 30)
            raise AssertionError("symlink accepted")
        except ValueError:
            pass
        destination = base / "existing"
        destination.mkdir()
        try:
            cache.publish(bad, destination)
            raise AssertionError("existing directory overwritten")
        except OSError:
            pass
        assert bad.exists() and destination.exists()
        before = inventory(b / "target-nix")
        cache.prepare(b)
        assert inventory(b / "target-nix") == before
        write(c / "Cargo.lock", (c / "Cargo.lock").read_text() + "\n# different lockfile\n")
        assert not cache.matching_inputs(b, c)
        manifest = b / "external/Cargo.toml"
        manifest.write_text(manifest.read_text().replace('"0.1.0"', '"0.2.0"'))
        command(b, "cargo", "generate-lockfile", "--offline", env=environment(b))
        build(b)
        assert command(b, str(b / "target-nix/debug/worktree-probe")).strip() == "C7"
        print("PASS: dependency manifest and lockfile changes build without cache reset")
        command(b, "cargo", "clean", env=environment(b))
        assert original.exists() and (c / "target-nix/debug").exists()
        print("PASS: symlink refusal, atomic no-overwrite, existing target untouched, compatibility, private clean")


if __name__ == "__main__":
    main()
