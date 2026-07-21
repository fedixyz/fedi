{
  pkgs,
  flakeboxLib,
  fedimint-pkgs,
  toolchains,
  replaceGitHash,
  profiles,
  craneMultiBuild,
  androidSdk,
}:
let
  system = pkgs.system;
  lib = pkgs.lib;

  rustSrcDirs = [
    "Cargo.toml"
    "Cargo.lock"
    ".cargo"
    ".config"
    ".clippy.toml"
    "bridge"
    "crates"
  ];

  root = builtins.path {
    name = "fedi";
    path = ./..;
  };

  # filter (roughly) only files&directories that Rust build needs to make
  # caching easier for Nix/crane
  rustSrc = flakeboxLib.filter.filterSubPaths {
    inherit root;
    paths = rustSrcDirs;
  };

  rustTestSrc = flakeboxLib.filter.filterSubPaths {
    inherit root;
    paths = rustSrcDirs ++ [
      # bridge test script
      "scripts"
      "misc"
    ];
  };

  # nixpkgs 26.05's sqlcipher package builds a shared object even under
  # pkgsStatic, which cannot be linked by the fully static musl toolchain.
  sqlcipherStatic = pkgs.pkgsStatic.sqlcipher.overrideAttrs (old: {
    configureFlags = (old.configureFlags or [ ]) ++ [
      "--disable-shared"
      "--enable-static"
    ];
    buildFlags = [ "lib" ];
    installTargets = [
      "install-lib"
      "install-headers"
      "install-pc"
    ];
    postInstall = ''
      mkdir $out/include/sqlcipher
      mv $out/include/sqlite3.h $out/include/sqlcipher/sqlite3.h
      mv $out/include/sqlite3ext.h $out/include/sqlcipher/sqlite3ext.h
      mv $out/lib/lib{sqlite3,sqlcipher}.a
      mv $out/lib/pkgconfig/{sqlite3,sqlcipher}.pc
      substituteInPlace $out/lib/pkgconfig/sqlcipher.pc \
        --replace-fail "-lsqlite3" "-lsqlcipher" \
        --replace-fail "-lz" "-lz -lcrypto" \
        --replace-fail "includedir}" "includedir}/sqlcipher"
    '';
  });
in
(flakeboxLib.craneMultiBuild { inherit toolchains profiles; }) (
  craneLib':
  let
    # placeholder we use to avoid actually needing to detect hash via runnning `git`
    # 012345... for easy recognizability (in case something went wrong),
    # rest randomized to avoid accidentally overwritting innocent bytes in the binary
    gitHashPlaceholderValue = "01234569abcdef7afa1d2683a099c7af48a523c1";

    commonEnvsShell = {
      PROTOC = "${pkgs.protobuf}/bin/protoc";
      PROTOC_INCLUDE = "${pkgs.protobuf}/include";
    };
    commonEnvsShellRocksdbLink =
      let
        build_arch_underscores =
          lib.strings.replaceStrings [ "-" ] [ "_" ]
            pkgs.stdenv.buildPlatform.config;
        build_arch_upper = lib.toUpper build_arch_underscores;
      in
      {
        # for cargo-deluxe
        CARGO_TARGET_SPECIFIC_ENVS = builtins.concatStringsSep "," [
          "ROCKSDB_target_STATIC"
          "ROCKSDB_target_LIB_DIR"
          "SNAPPY_target_STATIC"
          "SNAPPY_target_LIB_DIR"
          "SNAPPY_target_COMPILE"
          "SQLITE3_target_STATIC"
          "SQLITE3_target_LIB_DIR"
          "SQLCIPHER_target_STATIC"
          "SQLCIPHER_target_LIB_DIR"
        ];
      }
      // pkgs.lib.optionalAttrs (!pkgs.stdenv.isDarwin) {
        "ROCKSDB_${build_arch_underscores}_STATIC" = "true";
        "ROCKSDB_${build_arch_underscores}_LIB_DIR" = "${
          pkgs.rocksdb_8_11.override { enableLiburing = false; }
        }/lib/";

        # librocksdb-sys 0.17+ no longer reliably propagates C++ stdlib
        # linkage from RocksDB, which leaves final binaries with undefined
        # std::* symbols during Nix builds.
        # Appended to the toolchain's own flags (wild linker etc.) instead of a plain
        # assignment, because this env attr overrides flakebox's toolchain env.
        "CARGO_TARGET_${build_arch_upper}_RUSTFLAGS" = "${
          toolchains.default.commonArgs."CARGO_TARGET_${build_arch_upper}_RUSTFLAGS" or ""
        } -C link-arg=-lstdc++";

        # does not produce static lib in most versions
        "SNAPPY_${build_arch_underscores}_STATIC" = "true";
        "SNAPPY_${build_arch_underscores}_LIB_DIR" = "${pkgs.pkgsStatic.snappy}/lib/";
        # "SNAPPY_${build_arch_underscores}_COMPILE" = "true";

        "SQLITE3_${build_arch_underscores}_STATIC" = "true";
        "SQLITE3_${build_arch_underscores}_LIB_DIR" = "${pkgs.pkgsStatic.sqlite.out}/lib/";

        "SQLCIPHER_${build_arch_underscores}_LIB_DIR" = "${sqlcipherStatic}/lib/";
        "SQLCIPHER_${build_arch_underscores}_STATIC" = "true";
      }
      // pkgs.lib.optionalAttrs pkgs.stdenv.isDarwin {
        # tons of problems, just compile
        # "SNAPPY_${build_arch_underscores}_LIB_DIR" = "${pkgs.snappy}/lib/";
        "SNAPPY_${build_arch_underscores}_COMPILE" = "true";

        "SQLITE3_${build_arch_underscores}_LIB_DIR" = "${pkgs.sqlite.out}/lib/";
        "SQLCIPHER_${build_arch_underscores}_LIB_DIR" = "${pkgs.sqlcipher}/lib/";

        # these two are mismatched between Nix/Rust so just set the
        # other one manually
        # See https://github.com/NixOS/nixpkgs/pull/393213
        "SQLITE3_aarch64_apple_darwin_LIB_DIR" = "${pkgs.pkgsStatic.sqlite.out}/lib/";
        # "SQLITE3_arm64_apple_darwin_LIB_DIR" = "${pkgs.pkgsStatic.sqlite.out}/lib/";

      };

    commonArgs =
      let
        # `moreutils/bin/parallel` and `parallel/bin/parallel` conflict, so just use
        # the binary we need from `moreutils`
        moreutils-ts = pkgs.writeShellScriptBin "ts" "exec ${pkgs.moreutils}/bin/ts \"$@\"";
      in
      {
        CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS = "--cfg getrandom_backend=\"wasm_js\" --cfg=curve25519_dalek_backend=\"serial\" -Csymbol-mangling-version=v0";
        packages = [
          # flakebox adds toolchains via `packages`, which seems to always take precedence
          # `nativeBuildInputs` in `mkShell`, so we need to add it here as well.
          (lib.hiPrio pkgs.cargo-deluxe)
        ];

        buildInputs =
          builtins.attrValues {
            inherit (pkgs) openssl;
          }
          ++ lib.optionals pkgs.stdenv.isDarwin [
            pkgs.libiconv
          ];

        nativeBuildInputs =
          (builtins.attrValues {
            inherit (pkgs)
              pkg-config
              parallel
              time
              cmake
              rust-bindgen
              cargo-nextest
              perl
              ;
            inherit moreutils-ts;
          })
          ++ lib.optionals pkgs.stdenv.isLinux [
            pkgs.mold
          ]
          ++ [
            (lib.hiPrio pkgs.cargo-deluxe)

            # add a command that can be used to lower both CPU and IO priority
            # of a command to help make it more friendly to other things
            # potentially sharing the CI or dev machine
            (
              if pkgs.stdenv.isLinux then
                [
                  pkgs.util-linux

                  (pkgs.writeShellScriptBin "runLowPrio" ''
                    set -euo pipefail

                    cmd=()
                    if ${pkgs.which}/bin/which chrt 1>/dev/null 2>/dev/null ; then
                      cmd+=(chrt -i 0)
                    fi
                    if ${pkgs.which}/bin/which ionice 1>/dev/null 2>/dev/null ; then
                      cmd+=(ionice -c 3)
                    fi

                    >&2 echo "Lowering IO priority with ''${cmd[@]}"
                    exec "''${cmd[@]}" "$@"
                  '')
                ]
              else
                [

                  (pkgs.writeShellScriptBin "runLowPrio" ''
                    exec "$@"
                  '')
                ]
            )
          ];

      };

    commonTestArgs = commonArgs // {
      # needed by matrix sdk even for local stuff
      SSL_CERT_FILE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";

      nativeBuildInputs = commonArgs.nativeBuildInputs ++ [
        pkgs.clightning
        pkgs.lnd
        pkgs.bitcoind
        pkgs.electrs
        pkgs.esplora-electrs
        fedimint-pkgs.packages.${system}.gateway-pkgs
        fedimint-pkgs.packages.${system}.fedimint-recurringd
        fedimint-pkgs.packages.${system}.fedimint-recurringdv2
        (pkgs.matrix-synapse.override { extras = [ ]; })
        pkgs.nostr-rs-relay
        # helpers
        pkgs.jq
        pkgs.bc
        pkgs.which
      ];
    };

    craneLib =
      (craneLib'.overrideArgs (
        commonArgs
        // {
          pname = "fedi";
          version = "0.1.0";
          src = rustSrc;

          FEDIMINT_BUILD_FORCE_GIT_HASH = gitHashPlaceholderValue;

          # we carefully optimize our debug symbols on cargo level,
          # and in case of errors and panics, would like to see the
          # line numbers etc.
          dontStrip = true;
        }
        // commonEnvsShell
      )).overrideArgs''
        (
          craneLib: args:
          # TODO: should we compile from scratch from vendored source for release builds? (allegedly better perf)
          # pkgs.lib.optionalAttrs (builtins.elem (craneLib.cargoProfile or "") [ "dev" "ci" ]) commonEnvsShellRocksdbLink);
          commonEnvsShellRocksdbLink
        );

    fediBuildPackageGroup =
      args:
      replaceGitHash {
        name = args.pname;
        package = (craneLib.buildPackageGroup args).overrideAttrs (old: {
          # Older Crane emits a null mainProgram for package groups; nixpkgs
          # 26.05 rejects null values in the structured derivation environment.
          meta = removeAttrs (old.meta or { }) [ "mainProgram" ];
        });
      };

    # Workspace libraries in `cargo tree --target wasm32-unknown-unknown
    # --package fedi-wasm --edges normal,build`. Promoting its workspace
    # dependencies to roots does not enable extra features because none has a
    # non-empty default feature.
    wasmClippyPackages = [
      "api-types"
      "bridge"
      "bug-report"
      "communities"
      "device-registration"
      "env"
      "federations"
      "fedi-ffi"
      "fedi-social-client"
      "fedi-social-common"
      "fedi-wasm"
      "matrix"
      "multispend"
      "nostril"
      "rpc-types"
      "runtime"
      "sp-transfer"
      "stability-pool-client"
      "stability-pool-client-old"
      "stability-pool-common"
      "stability-pool-common-old"
    ];
    wasmClippyArgs =
      lib.concatMapStringsSep " " (package: "--package ${package}") wasmClippyPackages
      + " --lib --no-deps";
    wasmClippyPreBuild = ''
      comm -12 \
        <(cargo metadata --locked --no-deps --format-version 1 | jq -r '.packages[].name' | sort) \
        <(cargo tree --locked --target wasm32-unknown-unknown --package fedi-wasm \
          --edges normal,build --prefix none | sed 's/ v[0-9].*//' | sort -u) \
        > actual-wasm-clippy-packages
      printf '%s\n' ${lib.escapeShellArgs wasmClippyPackages} \
        | sort > expected-wasm-clippy-packages
      if ! diff -u expected-wasm-clippy-packages actual-wasm-clippy-packages; then
        echo "Update wasmClippyPackages to match the fedi-wasm WASM dependency closure." >&2
        exit 1
      fi

      nonempty_defaults=$(
        cargo metadata --locked --no-deps --format-version 1 \
          | jq -r --argjson packages '${builtins.toJSON wasmClippyPackages}' \
             '.packages[]
             | select(.name as $name | $packages | index($name))
             | select(.name != "fedi-wasm")
             | select((.features.default // []) | length > 0)
             | .name'
      )
      if [[ -n "$nonempty_defaults" ]]; then
        echo "Promoted WASM Clippy roots must not enable extra default features:" >&2
        echo "$nonempty_defaults" >&2
        exit 1
      fi
    '';
  in
  rec {
    workspaceDeps = craneLib.buildWorkspaceDepsOnly {
      buildPhaseCargoCommand = "cargoWithProfile check --all-targets --locked ; cargoWithProfile build --locked --all-targets";
    };

    workspaceBuild = craneLib.buildWorkspace {
      cargoArtifacts = workspaceDeps;
      buildPhaseCargoCommand = "cargoWithProfile check --all-targets --locked ; cargoWithProfile build --locked --all-targets";
    };

    workspaceClippy = craneLib.cargoClippy {
      cargoArtifacts = workspaceBuild;

      cargoClippyExtraArgs = "--all-targets --no-deps -- --deny warnings --allow deprecated";
      doInstallCargoArtifacts = false;
    };

    workspaceCargoUdepsDeps = craneLib.buildDepsOnly {
      pname = "fedi-cargo-udeps-deps";
      nativeBuildInputs = commonArgs.nativeBuildInputs ++ [ pkgs.cargo-udeps ];
      # since we filtered all the actual project source, everything will definitely fail
      # but we only run this step to cache the build artifacts, so we ignore failure with `|| true`
      buildPhaseCargoCommand = "cargo udeps --all-targets --profile $CARGO_PROFILE || true";
      doCheck = false;
    };

    workspaceCargoUdeps = craneLib.mkCargoDerivation {
      pname = "fedi-cargo-udeps";
      cargoArtifacts = workspaceCargoUdepsDeps;
      nativeBuildInputs = commonArgs.nativeBuildInputs ++ [ pkgs.cargo-udeps ];
      buildPhaseCargoCommand = "cargo udeps --all-targets --profile $CARGO_PROFILE";
      doInstallCargoArtifacts = false;
      doCheck = false;
    };

    workspaceWasmDeps = craneLib.buildWorkspaceDepsOnly {
      cargoArtifacts = workspaceDeps;
      buildPhaseCargoCommand = "cargoWithProfile build --locked --lib --package fedi-wasm";
    };

    workspaceWasmBuild = craneLib.buildWorkspace {
      cargoArtifacts = workspaceWasmDeps;
      buildPhaseCargoCommand = "cargoWithProfile build --locked --lib --package fedi-wasm";
    };

    workspaceWasmClippyDeps = craneLib.buildDepsOnly {
      pname = "fedi-wasm-clippy-deps";
      nativeBuildInputs = commonArgs.nativeBuildInputs ++ [ pkgs.jq ];
      preBuild = wasmClippyPreBuild;
      buildPhaseCargoCommand = "cargoWithProfile clippy --locked ${wasmClippyArgs}";
    };

    workspaceWasmClippy = craneLib.cargoClippy {
      cargoArtifacts = workspaceWasmClippyDeps;
      # Keep the single-threaded WASM Arc exception local to this check.
      cargoClippyExtraArgs = "${wasmClippyArgs} -- --deny warnings --allow deprecated --allow clippy::arc_with_non_send_sync";
      doInstallCargoArtifacts = false;
    };

    fedi-wasm-pack = craneLib.mkCargoDerivation {
      pname = "fedi-wasm-pack";
      cargoArtifacts = null;

      doInstallCargoArtifacts = false;
      # need './scripts'
      src = rustTestSrc;

      nativeBuildInputs = [
        pkgs.wasm-pack
        pkgs.wasm-bindgen-cli
        pkgs.binaryen
      ];
      buildPhaseCargoCommand =
        let
          # wasm-pack can't do custom profiles, so default to dev
          packProfile = if craneLib.cargoProfile or "release" == "release" then "release" else "dev";
        in
        ''
          inheritCargoArtifacts \
            ${craneMultiBuild.wasm32-unknown.${packProfile}.workspaceWasmBuild} \
            "target/pkgs/wasm-pack"

          CARGO_PROFILE=${packProfile}

          patchShebangs ./scripts
          export IN_NIX_SHELL=ci
          export FEDI_INSTALL_IN_NIX_OUT=1
          ./scripts/build-wasm.sh
        '';
    };

    fedi-fedimint-pkgs = fediBuildPackageGroup {
      pname = "fedi-fedimint-pkgs";
      packages = [
        "fedi-fedimintd"
        "fedi-fedimint-cli"
      ];
    };

    fedi-fedimintd = flakeboxLib.pickBinary {
      bin = "fedimintd";
      pkg = fedi-fedimint-pkgs;
    };
    fedi-fedimint-cli = flakeboxLib.pickBinary {
      bin = "fedimint-cli";
      pkg = fedi-fedimint-pkgs;
    };

    api-types = fediBuildPackageGroup {
      pname = "api-types";
      packages = [
        "api-types"
      ];
    };

    fedi-wasm = fediBuildPackageGroup {
      pname = "fedi-wasm";
      packages = [
        "fedi-wasm"
      ];
    };

    fedi-ffi = fediBuildPackageGroup {
      pname = "fedi-ffi";
      packages = [
        "fedi-ffi"
      ];
    };

    fedi-android-bridge-libs-depsOnly = toolchains."all".craneLib.buildDepsOnly {
      pname = "fedi-android-bridge-libs-deps";
      version = "0.1.0";

      src = rustSrc;

      nativeBuildInputs = commonArgs.nativeBuildInputs;

      # Set up Android environment variables
      ANDROID_SDK_ROOT = "${androidSdk}/share/android-sdk";
      FEDIMINT_BUILD_FORCE_GIT_HASH = gitHashPlaceholderValue;

      buildPhaseCargoCommand = ''

        mkdir -p scripts/bridge
        cp ${../scripts/bridge/build-bridge-android-libs.sh} ./scripts/bridge/build-bridge-android-libs.sh
        cp ${../scripts/common.sh} ./scripts/common.sh
        patchShebangs ./scripts

        export REPO_ROOT=$(pwd)
        export HOME=$(pwd)

        env FM_BUILD_BRIDGE_ANDROID_LIBS_DEPS_ONLY=1 \
          ./scripts/bridge/build-bridge-android-libs.sh
      '';
    };

    fedi-android-bridge-libs-raw = toolchains."all".craneLib.mkCargoDerivation (
      {
        pname = "fedi-android-bridge-libs";
        version = "0.1.0";
        cargoArtifacts = fedi-android-bridge-libs-depsOnly;
        doInstallCargoArtifacts = false;

        src = rustSrc;

        nativeBuildInputs = commonArgs.nativeBuildInputs;

        # Set up Android environment variables
        ANDROID_SDK_ROOT = "${androidSdk}/share/android-sdk";
        FEDIMINT_BUILD_FORCE_GIT_HASH = gitHashPlaceholderValue;

        buildPhaseCargoCommand = ''
          mkdir -p scripts/bridge
          cp ${../scripts/bridge/build-bridge-android-libs.sh} ./scripts/bridge/build-bridge-android-libs.sh
          cp ${../scripts/common.sh} ./scripts/common.sh
          patchShebangs ./scripts

          export REPO_ROOT=$(pwd)
          export HOME=$(pwd)

          env FM_BUILD_BRIDGE_ANDROID_LIBS_OUT=$out/share/fedi-android/ \
            ./scripts/bridge/build-bridge-android-libs.sh
        '';
      }
      // commonEnvsShell
    );

    fedi-android-bridge-libs = replaceGitHash {
      name = "fedi-android-bridge-libs";
      package = fedi-android-bridge-libs-raw;
    };

    testStabilityPool = craneLib.buildCommand (
      commonTestArgs
      // {
        pname = "fedi-test-stability-pool";
        cargoArtifacts = workspaceBuild;
        doInstallCargoArtifacts = false;
        src = rustTestSrc;

        cmd = ''
          patchShebangs ./scripts
          export CARGO_DENY_COMPILATION=1

          # check that all expected binaries are available
          for i in lnd lightningd gatewayd esplora electrs bitcoind ; do
             which $i
          done

          export HOME=/tmp
          ./scripts/test-stability-pool.sh
        '';
      }
    );

    testBridge = craneLib.buildCommand (
      commonTestArgs
      // {
        pname = "fedi-test-bridge";
        cargoArtifacts = workspaceBuild;
        doInstallCargoArtifacts = false;
        src = rustTestSrc;

        cmd = ''
          patchShebangs ./scripts
          export CARGO_DENY_COMPILATION=1

          # check that all expected binaries are available
          for i in lnd lightningd gatewayd esplora electrs bitcoind ; do
             which $i
          done

          export HOME=/tmp
          ./scripts/test-bridge.sh
        '';
      }
    );

    testCiAll = craneLib.buildCommand (
      commonTestArgs
      // {
        pname = "fedi-test-ci-all";
        cargoArtifacts = workspaceBuild;
        doInstallCargoArtifacts = false;
        src = rustTestSrc;

        cmd = ''
          patchShebangs ./scripts

          export HOME=/tmp
          export FM_TEST_CI_ALL_TIMES=${builtins.toString 1}
          export FM_TEST_CI_ALL_DISABLE_ETA=1
          export UPSTREAM_FEDIMINTD_NIX_PKG=${fedimint-pkgs.packages.${system}.fedimintd}
          export FEDIMINT_LOAD_TEST_TOOL_NIX_PKG=${fedimint-pkgs.packages.${system}.fedimint-load-test-tool}
          ./scripts/test-ci-all.sh
        '';
      }
    );

    container =
      let
        entrypointScript = pkgs.writeShellScriptBin "entrypoint" ''
          exec bash "${../misc/fedimintd-container-entrypoint.sh}" "$@"
        '';
      in
      {
        fedi-fedimintd = pkgs.dockerTools.buildLayeredImage {
          name = "fedi-fedimintd";
          contents = [
            fedi-fedimint-pkgs
            pkgs.bash
            pkgs.coreutils
            pkgs.busybox
            pkgs.cacert
            (pkgs.lib.hiPrio pkgs.gnutar)
            pkgs.curl
            pkgs.rsync
          ];
          config = {
            Cmd = [ ]; # entrypoint will handle empty vs non-empty cmd
            Env = [
              "FM_DATA_DIR=/data"
              "SSL_CERT_FILE=/etc/ssl/certs/ca-bundle.crt"
              "SSL_CERT_DIR=/etc/ssl/certs"
            ];
            Entrypoint = [
              "${entrypointScript}/bin/entrypoint"
            ];
            WorkDir = "/data";
            Volumes = {
              "/data" = { };
            };
            ExposedPorts = {
              "${builtins.toString 8173}/tcp" = { };
              "${builtins.toString 8174}/tcp" = { };
            };
          };
        };

        fedi-fedimint-cli = pkgs.dockerTools.buildLayeredImage {
          name = "fedi-fedimint-cli";
          contents = [
            fedi-fedimint-cli
            pkgs.bash
            pkgs.coreutils
            pkgs.busybox
            pkgs.cacert
            (pkgs.lib.hiPrio pkgs.gnutar)
            pkgs.curl
            pkgs.rsync
          ];
          config = {
            Cmd = [
              "${fedimint-pkgs}/bin/fedimint-cli"
            ];
            Env = [
              "SSL_CERT_FILE=/etc/ssl/certs/ca-bundle.crt"
              "SSL_CERT_DIR=/etc/ssl/certs"
            ];
          };
        };
      };

    inherit commonEnvsShell commonArgs;
    inherit commonEnvsShellRocksdbLink;
  }
)
