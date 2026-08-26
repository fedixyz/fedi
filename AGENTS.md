# Agent instructions

- Read [`SECURITY.md`](./SECURITY.md) before changing bridge lifecycle,
  identity derivation, persistence, private Nix inputs, or network-facing code.
- Rust RPC types under `crates/rpc-types` are the source of truth for generated
  TypeScript bindings. Run `just generate-bridge-bindings`; never hand-edit
  `ui/common/types/bindings.ts`.
- The FI bridge consumes `fi-client` as a library. Keep formation policy and
  transitions in Manifold; Fedi owns identity derivation, database namespace,
  task lifecycle, wallet adapters, and UI/RPC projection.
