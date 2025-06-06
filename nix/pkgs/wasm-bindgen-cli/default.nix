{
  lib,
  rustPlatform,
  fetchFromGitHub,
  nix-update-script,
  nodejs_latest,
  pkg-config,
  openssl,
  stdenv,
  curl,
  darwin,
  version ? "0.2.100",
  rev ? "2405ec2b4bcd1cc4e3bd1562c373e9d5f0cbdcb5",
  hash ? "sha256-IPqzPjZwub+yuS98O3tEvl3FViann/WBDjDw3+4jmYo=",
  cargoHash ? "",
}:

rustPlatform.buildRustPackage {
  pname = "wasm-bindgen-cli";
  inherit version cargoHash;

  # https://github.com/rustwasm/wasm-bindgen/pull/4380
  src = fetchFromGitHub {
    owner = "rustwasm";
    repo = "wasm-bindgen";
    inherit hash rev;
  };

  cargoPatches = [
    # a patch file to add/update Cargo.lock in the source code
    ./Cargo.lock.patch
  ];

  cargoLock =
    let
      fixupLockFile = path: (builtins.readFile path);
    in
    {
      # lockFileContents = fixupLockFile ./Cargo.lock;
      lockFile = ./Cargo.lock;

      outputHashes = {
        "raytracer-0.1.0" = "sha256-k6emdBDunYK4pUxrwJCbm57LzICj+q4bRAJ/XJ0zsg0=";
        "weedle-0.13.0" = "sha256-S/AzZmEPamYt0vT6eM8fxnZmXWXwV1DLxVlLIYemZYc=";
      };
    };

  cargoBuildFlags = [ "--package wasm-bindgen-cli" ];

  nativeBuildInputs = [ pkg-config ];

  buildInputs =
    [ openssl ]
    ++ lib.optionals stdenv.hostPlatform.isDarwin [
      curl
      darwin.apple_sdk.frameworks.Security
    ];

  nativeCheckInputs = [ nodejs_latest ];

  # tests require it to be ran in the wasm-bindgen monorepo
  doCheck = false;

  passthru.updateScript = nix-update-script { };

  meta = {
    homepage = "https://rustwasm.github.io/docs/wasm-bindgen/";
    license = with lib.licenses; [
      asl20 # or
      mit
    ];
    description = "Facilitating high-level interactions between wasm modules and JavaScript";
    maintainers = with lib.maintainers; [ rizary ];
    mainProgram = "wasm-bindgen";
  };
}
