#!/usr/bin/env python3
"""Copy the localized What's New texts from one App Store version to another.

usage: port-whats-new.py <source-version-id> <target-version-id>
env: ASC_CREDS - path to the key json, passed through to the asc.sh beside this script

Patches every locale the source has onto the target (creating any locale the
target lacks), then re-reads the target and fails unless every text matches
byte for byte. Locales that exist only on the target are left untouched and
reported, as is any source locale with an empty What's New.
"""
import json
import os
import subprocess
import sys

ASC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "asc.sh")
FIELDS = "?limit=50&fields[appStoreVersionLocalizations]=locale,whatsNew"


def asc(path, *args, payload=None):
    cmd = ["bash", ASC, path, *args]
    if payload is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", "@-"]
    r = subprocess.run(cmd, capture_output=True, text=True,
                       input=json.dumps(payload) if payload is not None else None)
    if r.returncode != 0:
        raise RuntimeError(f"asc {path}: {r.stderr}")
    body = json.loads(r.stdout) if r.stdout.strip() else {}
    if "errors" in body:
        raise RuntimeError(f"asc {path}: {json.dumps(body['errors'])}")
    return body


def localizations(version_id):
    data = asc(f"appStoreVersions/{version_id}/appStoreVersionLocalizations{FIELDS}")["data"]
    return {l["attributes"]["locale"]: l for l in data}


def main():
    source_id, target_id = sys.argv[1], sys.argv[2]
    source = localizations(source_id)
    notes = {loc: l["attributes"]["whatsNew"] for loc, l in source.items()
             if l["attributes"]["whatsNew"]}
    if not notes:
        sys.exit("source version has no What's New texts")
    for loc in sorted(set(source) - set(notes)):
        print(f"{loc}: skipped, empty on the source")

    target = localizations(target_id)
    for locale, text in sorted(notes.items()):
        if locale in target:
            asc(f"appStoreVersionLocalizations/{target[locale]['id']}", "-X", "PATCH", payload={
                "data": {"type": "appStoreVersionLocalizations", "id": target[locale]["id"],
                         "attributes": {"whatsNew": text}}})
            print(f"{locale}: patched ({len(text)} chars)")
        else:
            asc("appStoreVersionLocalizations", "-X", "POST", payload={
                "data": {"type": "appStoreVersionLocalizations",
                         "attributes": {"locale": locale, "whatsNew": text},
                         "relationships": {"appStoreVersion": {
                             "data": {"type": "appStoreVersions", "id": target_id}}}}})
            print(f"{locale}: created ({len(text)} chars)")

    final = localizations(target_id)
    bad = [loc for loc, text in notes.items()
           if final.get(loc, {}).get("attributes", {}).get("whatsNew") != text]
    if bad:
        sys.exit(f"read-back mismatch for: {', '.join(sorted(bad))}")
    for loc in sorted(set(final) - set(notes)):
        held = final[loc]["attributes"]["whatsNew"]
        print(f"{loc}: WARNING, only on the target, untouched "
              f"({'holds ' + str(len(held)) + ' chars' if held else 'empty'}); review it")
    print(f"verified: all {len(notes)} ported locales match the source byte for byte")


if __name__ == "__main__":
    main()
