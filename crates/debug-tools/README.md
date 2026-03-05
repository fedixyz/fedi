# fedi-debug

Utilities for debugging/importing app database dumps.

## End-to-End: Undump + Secret + CLI Info

Run from repo root.

### 1) Undump a DB into the desired dir

```bash
DATA_DIR="$(mktemp -d ./fm-undump.XXXXXX)"
cargo run -p fedi-debug -- undump "$DATA_DIR/client.db" db.dump
```

Notes:
- `db.dump` can be raw dump bytes or base64-encoded dump text.
- `undump` prints whether a `federation_secret` header exists and, if present, its value.

### 2) Get the federation secret from undump output

```bash
DATA_DIR="$(mktemp -d ./fm-undump.XXXXXX)"
UNDUMP_OUTPUT="$(cargo run -q -p fedi-debug -- undump "$DATA_DIR/client.db" db.dump)"
SECRET="$(printf '%s\n' "$UNDUMP_OUTPUT" | sed -n 's/^federation_secret header value: //p' | tail -n 1)"
printf 'secret=%s\n' "$SECRET"
```

### 3) Run `fedimint-cli` on the undumped data dir using that secret

```bash
cargo run -q -p fedi-fedimint-cli -- \
  --data-dir "$DATA_DIR" \
  --federation-secret-hex "$SECRET" \
  info
```

## Full Example (single block)

```bash
DATA_DIR="$(mktemp -d ./fm-undump.XXXXXX)"

UNDUMP_OUTPUT="$(cargo run -q -p fedi-debug -- undump "$DATA_DIR/client.db" db.dump)"
printf '%s\n' "$UNDUMP_OUTPUT"

SECRET="$(printf '%s\n' "$UNDUMP_OUTPUT" | sed -n 's/^federation_secret header value: //p' | tail -n 1)"
test -n "$SECRET" || { echo "No federation secret found in dump header"; exit 1; }

cargo run -q -p fedi-fedimint-cli -- \
  --data-dir "$DATA_DIR" \
  --federation-secret-hex "$SECRET" \
  info
```
