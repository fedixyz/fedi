{ pkgs, flakeboxLib, fedimint-pkgs, toolchains, replaceGitHash, profiles, craneMultiBuild }:
let
  system = pkgs.system;
  lib = pkgs.lib;

  rustSrcDirs = [
    "Cargo.toml"
    "Cargo.lock"
    ".cargo"
    ".config"
    "bridge"
    "fedimintd"
    "fedimint-cli"
    "fedi-api-types"
    "fedi-db-dump"
    "fedi-debug"
    "fedi-core"
    "devi"
    "modules/fedi-social/client"
    "modules/fedi-social/common"
    "modules/fedi-social/server"
    "modules/stability-pool/client"
    "modules/stability-pool/common"
    "modules/stability-pool/server"
    "modules/stability-pool/tests"
  ];

  root = builtins.path {
    name = "fedi";
    path = ./..;
  };

  # filter (roughly) only files&directories that Rust build needs to make
  # caching easier for Nix/crane
  rustSrc =
    flakeboxLib.filter.filterSubPaths {
      inherit root;
      paths = rustSrcDirs;
    };

  rustTestSrc =
    flakeboxLib.filter.filterSubPaths {
      inherit root;
      paths = rustSrcDirs ++ [
        # bridge test script
        "scripts"
        "misc"
      ];
    };
in
(flakeboxLib.craneMultiBuild { inherit toolchains profiles; }) (craneLib':
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
      build_arch_underscores = lib.strings.replaceStrings [ "-" ] [ "_" ] pkgs.stdenv.buildPlatform.config;
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
    } // pkgs.lib.optionalAttrs (!pkgs.stdenv.isDarwin) {
      "ROCKSDB_${build_arch_underscores}_STATIC" = "true";
      "ROCKSDB_${build_arch_underscores}_LIB_DIR" = "${pkgs.rocksdb}/lib/";

      # does not produce static lib in most versions
      "SNAPPY_${build_arch_underscores}_STATIC" = "true";
      "SNAPPY_${build_arch_underscores}_LIB_DIR" = "${pkgs.pkgsStatic.snappy}/lib/";
      # "SNAPPY_${build_arch_underscores}_COMPILE" = "true";


      "SQLITE3_${build_arch_underscores}_STATIC" = "true";
      "SQLITE3_${build_arch_underscores}_LIB_DIR" = "${pkgs.pkgsStatic.sqlite.out}/lib/";

      "SQLCIPHER_${build_arch_underscores}_LIB_DIR" = "${pkgs.pkgsStatic.sqlcipher}/lib/";
      "SQLCIPHER_${build_arch_underscores}_STATIC" = "true";
    } // pkgs.lib.optionalAttrs pkgs.stdenv.isDarwin {
      # tons of problems, just compile
      # "SNAPPY_${build_arch_underscores}_LIB_DIR" = "${pkgs.snappy}/lib/";
      "SNAPPY_${build_arch_underscores}_COMPILE" = "true";

      "SQLITE3_${build_arch_underscores}_LIB_DIR" = "${pkgs.sqlite.out}/lib/";
      "SQLCIPHER_${build_arch_underscores}_LIB_DIR" = "${pkgs.sqlcipher}/lib/";
    };

  commonArgs =
    let
      # `moreutils/bin/parallel` and `parallel/bin/parallel` conflict, so just use
      # the binary we need from `moreutils`
      moreutils-ts = pkgs.writeShellScriptBin "ts" "exec ${pkgs.moreutils}/bin/ts \"$@\"";
    in
    {
      packages = [
        # flakebox adds toolchains via `packages`, which seems to always take precedence
        # `nativeBuildInputs` in `mkShell`, so we need to add it here as well.
        (lib.hiPrio pkgs.cargo-deluxe)
      ];

      buildInputs = builtins.attrValues
        {
          inherit (pkgs) openssl;
        } ++ lib.optionals pkgs.stdenv.isDarwin [
        pkgs.libiconv
        pkgs.darwin.apple_sdk.frameworks.SystemConfiguration
      ];

      nativeBuildInputs = (builtins.attrValues {
        inherit (pkgs) mold pkg-config parallel time;
        inherit (pkgs) cargo-nextest;
        inherit (pkgs) perl;
        inherit moreutils-ts;
      }) ++ [
        (lib.hiPrio pkgs.cargo-deluxe)

        # add a command that can be used to lower both CPU and IO priority
        # of a command to help make it more friendly to other things
        # potentially sharing the CI or dev machine
        (if pkgs.stdenv.isLinux then [
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
          ''
          )
        ] else [

          (pkgs.writeShellScriptBin "runLowPrio" ''
            exec "$@"
          ''
          )
        ])
      ];

    };

  commonTestArgs = commonArgs // {

    nativeBuildInputs =
      commonArgs.nativeBuildInputs ++ [
        pkgs.clightning
        pkgs.lnd
        pkgs.bitcoind
        pkgs.electrs
        pkgs.esplora-electrs
        fedimint-pkgs.packages.${system}.gateway-pkgs
        # helpers
        pkgs.jq
        pkgs.bc
        pkgs.which
      ];
  };

  craneLib =
    (craneLib'.overrideArgs (commonArgs // {
      pname = "fedi";
      version = "0.1.0";
      src = rustSrc;

      FEDIMINT_BUILD_FORCE_GIT_HASH = gitHashPlaceholderValue;

      # we carefully optimize our debug symbols on cargo level,
      # and in case of errors and panics, would like to see the
      # line numbers etc.
      dontStrip = true;
    } // commonEnvsShell)).overrideArgs'' (craneLib: args:
      # TODO: should we compile from scratch from vendored source for release builds? (allegedly better perf)
      # pkgs.lib.optionalAttrs (builtins.elem (craneLib.cargoProfile or "") [ "dev" "ci" ]) commonEnvsShellRocksdbLink);
      commonEnvsShellRocksdbLink);

  fediBuildPackageGroup = args: replaceGitHash {
    name = args.pname;
    package =
      craneLib.buildPackageGroup args;
  };
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

  fedi-wasm-pack = craneLib.mkCargoDerivation {
    pname = "fedi-wasm-pack";
    cargoArtifacts = null;

    doInstallCargoArtifacts = false;
    # need './scripts'
    src = rustTestSrc;

    nativeBuildInputs = [ pkgs.wasm-pack pkgs.wasm-bindgen-cli pkgs.binaryen ];
    buildPhaseCargoCommand =
      let
        # wasm-pack can't do custom profiles, so default to dev
        packProfile =
          if craneLib.cargoProfile or "release" == "release" then
            "release"
          else
            "dev"
        ;
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

  fedi-fedimintd = flakeboxLib.pickBinary { bin = "fedimintd"; pkg = fedi-fedimint-pkgs; };
  fedi-fedimint-cli = flakeboxLib.pickBinary { bin = "fedimint-cli"; pkg = fedi-fedimint-pkgs; };

  fedi-api-types = fediBuildPackageGroup {
    pname = "fedi-api-types";
    packages = [
      "fedi-api-types"
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

  testStabilityPool = craneLib.buildCommand (commonTestArgs // {
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
  });

  testBridgeAll = pkgs.linkFarmFromDrvs "fedi-test-bridge-all" [
    testBridgeCurrent
  ];

  testBridgeCurrent = craneLib.buildCommand (commonTestArgs // {
    pname = "fedi-test-bridge-current";
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
      ./scripts/test-bridge-current.sh
    '';
  });

  testCiAll = craneLib.buildCommand (commonTestArgs // {
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
      ./scripts/test-ci-all.sh
    '';
  });

  container =
    let
      entrypointScript =
        pkgs.writeShellScriptBin "entrypoint" ''
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
          pkgs.curl
          pkgs.rsync
        ];
        config = {
          Cmd = [ ]; # entrypoint will handle empty vs non-empty cmd
          Env = [
            "FM_DATA_DIR=/data"
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
        contents = [ fedi-fedimint-cli pkgs.bash pkgs.coreutils pkgs.busybox pkgs.curl pkgs.rsync ];
        config = {
          Cmd = [
            "${fedimint-pkgs}/bin/fedimint-cli"
          ];
        };
      };
    };


  inherit commonEnvsShell commonArgs;
  inherit commonEnvsShellRocksdbLink;
})
