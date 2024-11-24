{
  inputs = {
    nixpkgs = {
      url = "github:NixOS/nixpkgs/nixos-24.05";
    };
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    fedimint-pkgs = {
      url = "github:fedibtc/fedimint?ref=v0.4.3-rc.2-fed4";
    };

    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    flakebox = {
      url = "github:fedibtc/flakebox?rev=675075a4049253289e7cce634b1b6443b046ed1b";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.fenix.follows = "fenix";
    };

    fs-dir-cache = {
      url = "github:fedibtc/fs-dir-cache?rev=a6371f48f84512ea06a8ac671f9cdc141a732673";
    };

    cargo-deluxe = {
      url = "github:rustshop/cargo-deluxe?rev=da124f8fffa731a647420065f204601f9a20b289";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    android-nixpkgs = {
      url = "github:tadfisher/android-nixpkgs?rev=6370a3aafe37ed453bfdc4af578eb26339f8fee0"; # stable
      # inputs.nixpkgs.follows = "fedimint-pkgs/nixpkgs";
    };
  };

  outputs = { self, nixpkgs, nixpkgs-unstable, flake-utils, fedimint-pkgs, fs-dir-cache, cargo-deluxe, android-nixpkgs, flakebox, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs-unstable = import nixpkgs-unstable {
          inherit system;
        };

        pkgs = import nixpkgs {
          inherit system;
          overlays = [
            fedimint-pkgs.overlays.all

            (final: prev: {
              fs-dir-cache = fs-dir-cache.packages.${system}.default;
              fastlane = pkgs-unstable.fastlane;
              convco = pkgs-unstable.convco;
              cargo-deluxe = cargo-deluxe.packages.${system}.default;
              snappy = prev.snappy.overrideAttrs (f: p: rec {
                version = "1.2.1";
                  src = prev.fetchFromGitHub {
                  owner = "google";
                  repo = "snappy";
                  rev = version;
                  hash = "sha256-IzKzrMDjh+Weor+OrKdX62cAKYTdDXgldxCgNE2/8vk=";
                };
              });
            })
          ];
        };

        fmLib = fedimint-pkgs.lib.${system};

        # Replace placeholder git hash in a binary
        #
        # To avoid impurity, we use a git hash placeholder when building binaries
        # and then replace them with the real git hash in the binaries themselves.
        #
        # BUG: rev and dirtyRev are not available in-local flake builds. :/
        replaceGitHash =
          let
            # the hash we will set if the tree is dirty;
            dirtyHashPrefix = builtins.substring 0 16 self.dirtyRev;
            dirtyHashSuffix = builtins.substring (40 - 16) 16 self.dirtyRev;
            # the string needs to be 40 characters, like the original,
            # so to denote `-dirty` we replace the middle with zeros
            dirtyHash = "${dirtyHashPrefix}00000000${dirtyHashSuffix}";
          in
          { name
          , package
          , placeholder ? "01234569abcdef7afa1d2683a099c7af48a523c1"
          , gitHash ? if (self ? rev) then self.rev else if (self ? dirtyRev) then dirtyHash else placeholder
          }:
          stdenv.mkDerivation {
            inherit system;
            inherit name;

            dontUnpack = true;
            dontStrip = !pkgs.stdenv.isDarwin;

            installPhase = ''
              cp -a ${package} $out
              for path in `find $out -type f -executable`; do
                # need to use a temporary file not to overwrite source as we are reading it
                bbe -e 's/${placeholder}/${gitHash}/' $path -o ./tmp || exit 1
                chmod +w $path
                # use cat to keep all the original permissions etc as they were
                cat ./tmp > "$path"
                chmod -w $path
              done
            '';

            buildInputs = [ pkgs.bbe ];
          };

        # TODO: use this version after updating upstream fedimint to handle `gitHash` argument
        # replaceGitHash = name: package: fmLib.replaceGitHash {
        #   # FIXME: don't hard-code this. But I don't know how to get it from craneLib
        #   inherit name package; placeholder = "01234569abcdef7afa1d2683a099c7af48a523c1";
        # gitHash ? if (self ? rev) then self.rev else dirty-hash
        # };


        androidSdk =
          android-nixpkgs.sdk."${system}" (sdkPkgs: with sdkPkgs; [
            cmdline-tools-latest
            build-tools-30-0-3
            build-tools-32-0-0
            build-tools-33-0-0
            build-tools-34-0-0
            platform-tools
            platforms-android-31
            platforms-android-33
            platforms-android-34
            emulator
            ndk-bundle
            ndk-23-1-7779620
            cmake-3-22-1
            patcher-v4
            tools
          ]);


        flakeboxLib = flakebox.lib.${system} {
          # customizations will go here in the future
          config = {
            toolchain.channel = "latest";

            # we have our own weird CI workflows
            github.ci.enable = false;
            just.importPaths = [
              "justfile.fedi"
            ];
            typos.pre-commit.enable = false;
            git.pre-commit.trailing_newline = false;

            # we must not use --workspace anywhere
            just.rules.clippy.content = lib.mkForce ''
              # run `cargo clippy` on everything
              clippy *ARGS="--locked --all-targets":
                cargo clippy {{ARGS}}
                cargo clippy --package fedi-wasm --target wasm32-unknown-unknown {{ARGS}}

              # run `cargo clippy --fix` on everything
              clippy-fix *ARGS="--locked --all-targets":
                just clippy {{ARGS}} --fix
            '';
            just.rules.build.content = lib.mkForce ''
              # run `cargo build` on everything
              build:
                cargo build --all-targets
            '';
            just.rules.check.content = lib.mkForce ''
              # run `cargo check` on everything
              check:
                cargo check --all-targets
            '';
          };
        };

        toolchainArgs = let llvmPackages = pkgs.llvmPackages_11; in {
          extraRustFlags = "--cfg tokio_unstable -Z threads=5 --cfg=curve25519_dalek_backend=\"serial\" -Csymbol-mangling-version=v0";

          components = [
            "rustc"
            "cargo"
            "clippy"
            "rust-analyzer"
            "rust-src"
          ];

          args = {
            nativeBuildInputs = [ pkgs.wasm-bindgen-cli pkgs.geckodriver pkgs.wasm-pack ]
              ++ lib.optionals (!pkgs.stdenv.isDarwin) [
              pkgs.firefox
            ];
          };
        };

        stdTargets = flakeboxLib.mkStdTargets {
          inherit androidSdk;
        };
        stdToolchains = flakeboxLib.mkStdToolchains toolchainArgs;

        toolchainDefault = flakeboxLib.mkFenixToolchain (toolchainArgs
          // {
          targets = (pkgs.lib.getAttrs
            ([
              "default"
              "wasm32-unknown"
            ])
            stdTargets
          );
        });


        toolchainWasm = flakeboxLib.mkFenixToolchain (toolchainArgs
          // {
          defaultBuildTarget = "wasm32-unknown-unknown";
          targets = (pkgs.lib.getAttrs
            ([
              "default"
              "wasm32-unknown"
            ])
            stdTargets
          );
        });

        toolchainAll = flakeboxLib.mkFenixToolchain (toolchainArgs
          // {
          targets = (pkgs.lib.getAttrs
            ([
              "default"
              "aarch64-android"
              "x86_64-android"
              "arm-android"
              "armv7-android"
              "wasm32-unknown"
            ] ++ lib.optionals pkgs.stdenv.isDarwin [
              "aarch64-ios"
              "aarch64-ios-sim"
              "x86_64-ios"
            ])

            stdTargets
          );
        });

        craneMultiBuild = import nix/flakebox.nix {
          inherit pkgs flakeboxLib fedimint-pkgs replaceGitHash craneMultiBuild;
          toolchains = stdToolchains // {
            "default" = toolchainDefault;
            "wasm32-unknown-unkown" = toolchainWasm;
          };
          profiles = [ "dev" "ci" "test" "release" ];
        };

        lib = pkgs.lib;
        stdenv = pkgs.stdenv;

        # this symlinks binaries needed to run xcode-specific commands assuming
        # xcode is already installed on the machine (can't be nixified normally)
        xcode-wrapper = stdenv.mkDerivation {
          name = "xcode-wrapper-15.0.1";
          buildCommand = ''
            mkdir -p $out/bin

            ln -s /usr/bin/ld $out/bin/ld
            ln -s /usr/bin/clang $out/bin/clang
            ln -s /usr/bin/xcodebuild $out/bin/xcodebuild
            ln -s /usr/bin/xcrun $out/bin/xcrun

            # Check if we have the xcodebuild version that we want
            if [ -z "$($out/bin/xcodebuild -version | grep 15.0.1)" ]
            then
                echo "xcodebuild version: 15.0.1 is required"
                echo "run: \`just install-xcode\` to install Xcode.app from the CLI"
                exit 1
            fi
          '';
        };

        crossDevShell = flakeboxLib.mkDevShell (craneMultiBuild.commonEnvsShell // craneMultiBuild.commonEnvsShellRocksdbLink // craneMultiBuild.commonArgs // {
          toolchain = toolchainAll;
          nativeBuildInputs = craneMultiBuild.commonArgs.nativeBuildInputs ++
            [
              fedimint-pkgs.packages.${system}.gateway-pkgs
              pkgs.fs-dir-cache
              pkgs.cargo-nextest
              pkgs.cargo-audit
              pkgs.cargo-udeps
              pkgs.curl # wasm build needs it for some reason
              pkgs.wasm-pack
              pkgs.wasm-bindgen-cli
              pkgs.binaryen
              pkgs.gnused
              pkgs.yarn
              pkgs.nodejs_22
              pkgs.nodePackages.prettier # for ts-bindgen
              pkgs.jdk17
              pkgs.nodePackages.typescript-language-server
              # tools for managing native app deployments
              pkgs.fastlane
              pkgs.ruby
              pkgs.perl
              pkgs.pkg-config
              pkgs.mprocs
              pkgs.bitcoind
              pkgs.electrs
              pkgs.esplora-electrs
              pkgs.clightning
              pkgs.lnd
              pkgs.sccache

              androidSdk
            ];

          buildInputs = craneMultiBuild.commonArgs.buildInputs ++ [ pkgs.openssl ];

          # Use old ESLINT config format
          ESLINT_USE_FLAT_CONFIG = false;
          FEDI_CROSS_DEV_SHELL = "1";
          shellHook = ''
            export PATH=$PATH:''${ANDROID_SDK_ROOT}/../../bin
            alias create-avd="avdmanager create avd --force --name phone --package 'system-images;android-32;google_apis;arm64-v8a' --path $PWD/avd";
            alias emulator="emulator -avd phone"

            export REPO_ROOT="$(git rev-parse --show-toplevel)"
            export RUSTC_WRAPPER=${pkgs.sccache}/bin/sccache
            export CARGO_BUILD_TARGET_DIR="''${CARGO_BUILD_TARGET_DIR:-''${REPO_ROOT}/target-nix}"
            export UPSTREAM_FEDIMINTD_NIX_PKG=${fedimint-pkgs.packages.${system}.fedimintd}

            # this is where we publish the android bridge package so the react native app
            # can find it as a local maven dependency
            export ANDROID_BRIDGE_ARTIFACTS="''${REPO_ROOT}/bridge/fedi-android/artifacts"
          '';
        });
      in
      {
        packages = {
          # straight from Fedimint, without any modifications
          gateway-pkgs = fedimint-pkgs.packages.${system}.gateway-pkgs;
          gatewayd = fedimint-pkgs.packages.${system}.gatewayd;
          gateway-cli = fedimint-pkgs.packages.${system}.gateway-cli;
          fedimint-dbtool = flakeboxLib.pickBinary { bin = "fedimint-dbtool"; pkg = fedimint-pkgs.packages.${system}.fedimint-pkgs; };

          fedi-fedimint-pkgs = craneMultiBuild.fedi-fedimint-pkgs;
          fedi-fedimintd = craneMultiBuild.fedi-fedimintd;
          fedi-fedimint-cli = craneMultiBuild.fedi-fedimint-cli;

          fedi-api-types = craneMultiBuild.fedi-api-types;
          fedi-wasm = craneMultiBuild.wasm32-unknown.release.fedi-wasm;
        };

        legacyPackages = craneMultiBuild;

        devShells = fmLib.devShells // {
          default = crossDevShell;
          # TODO: this is overriden just to fix semgrep on MacOS,
          # which will be fixed upstream as well. Then this whole section
          # can be removed
          lint = flakeboxLib.mkDevShell
            { };

          # nix develop .#xcode is used for running commands that depend on an
          # existing underlying Xcode installation that cannot be nixified
          xcode = crossDevShell.overrideAttrs (prev: {
            nativeBuildInputs = lib.optionals stdenv.isDarwin [
              pkgs.bundler
              pkgs.cocoapods
              xcode-wrapper
              pkgs.fs-dir-cache
            ] ++ prev.nativeBuildInputs;
            shellHook = prev.shellHook
              + ''
              # CocoaPods requires the terminal to be using UTF-8 encoding.
              export LC_ALL=en_US.UTF-8
              export LANG=en_US.UTF-8

              # LD envs are needed because xcodebuild is confused and tries
              # to use ld instead of clang for linking the bridge binary
              export LD=/usr/bin/clang
              export LD_FOR_TARGET=/usr/bin/clang
              export MACOSX_DEPLOYMENT_TARGET=""
            '';
          });
          # tool for managing pwa deployment
          vercel = crossDevShell.overrideAttrs (prev: {
            nativeBuildInputs = prev.nativeBuildInputs
              ++ [
              pkgs.nodePackages_latest.vercel
            ];
          });
        };
      });


  nixConfig = {
    extra-substituters = [ "https://fedibtc.cachix.org" ];
    extra-trusted-public-keys = [ "fedibtc.cachix.org-1:KyG8I1663EYQm2ThciPUvjm1r9PHiZbOYz4goj+U76k=" ];
  };
}
