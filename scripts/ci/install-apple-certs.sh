#!/usr/bin/env bash
# this script is used to download the Apple certificates required
# for Apple App Store deployments and install into the keychain used
# by the Mac OS runner for CI which is assumed to be the default System.keychain

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