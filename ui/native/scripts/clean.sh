#!/usr/bin/env bash

npx react-native clean

# clean rust code
pushd ../../bridge || exit 1
cargo clean
popd || exit 1
