#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

if ! command -v fastlane >/dev/null 2>&1; then
  >&2 echo "Error: fastlane is not installed. Rerun this script in a nix develop shell."
  exit 1
fi

# this script is used to download the Apple certificates required
# for Apple App Store deployments and install into the keychain used
# by the Mac OS runner for CI which is assumed to be the default System.keychain

# these are standard Apple root certificates
urls=(
    "https://www.apple.com/appleca/AppleIncRootCertificate.cer"
    "https://www.apple.com/certificateauthority/AppleWWDRCAG2.cer"
    "https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer"
    "https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer"
    "https://www.apple.com/certificateauthority/AppleWWDRCAG5.cer"
    "https://www.apple.com/certificateauthority/AppleWWDRCAG6.cer"
)

for url in "${urls[@]}"; do
    filename=$(basename "$url")
    tmpfile="/tmp/$filename"
    if curl -f -o "$tmpfile" "$url"; then
        echo "Importing certificate: $tmpfile into default keychain"
        # continue if the certs are already imported
        security import "$tmpfile" -T /usr/bin/codesign -T /usr/bin/security -T /usr/bin/productbuild -T /usr/bin/productsign || true
    fi
    rm -f "$tmpfile"
done

# these are signing certificates specifically for the Fedi iOS app
echo "Checking App Store Connect distribution certificates have not expired..."
pushd "$REPO_ROOT"/ui/native/ios
LANE_SUFFIX=""
if [ -n "${FLAVOR:-}" ]; then
  LANE_SUFFIX="_nightly"
fi

CHECK_RESULT=0
fastlane "check_appstore_certs${LANE_SUFFIX}" --verbose || CHECK_RESULT=$?

if [ $CHECK_RESULT -ne 0 ]; then
  echo "Certificate check failed. Attempting to renew certificates..."
  RENEW_RESULT=0
  fastlane "renew_appstore_certs${LANE_SUFFIX}" --verbose || RENEW_RESULT=$?
  if [ $RENEW_RESULT -eq 0 ]; then
    echo "Renewal succeeded. Re-checking certificates..."
    RE_CHECK_RESULT=0
    fastlane "check_appstore_certs${LANE_SUFFIX}" --verbose || RE_CHECK_RESULT=$?
    if [ $RE_CHECK_RESULT -ne 0 ]; then
      echo "Certificate check failed after renewal. Exiting."
      exit 1
    fi
  else
    echo "Certificate renewal failed. Exiting."
    exit 1
  fi
else
  echo "Certificate check passed."
fi
popd
