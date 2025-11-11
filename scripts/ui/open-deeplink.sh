#!/usr/bin/env bash

while true; do
    echo "Select platform to open a deeplink:"
    echo "i) iOS"
    echo "a) Android"
    echo "b) Back"
    read -rsn1 platform_choice
    echo ""

    case $platform_choice in
        i)
            while true; do
                read -p "Enter deeplink URL for iOS (or enter 'b' to go back): " deeplink_url
                if [ "$deeplink_url" = "b" ]; then
                    break
                fi
                echo "Opening deeplink on iOS simulator..."
                xcrun simctl openurl booted "$deeplink_url" || true
                echo ""
            done
            ;;
        a)
            # Handle multiple running Android devices
            devices=$(adb devices | grep -E 'device$|emulator' | awk '{print $1}')
            if [ -z "$devices" ]; then
                echo "No running Android emulators found."
                continue
            fi
            
            device_count=$(echo "$devices" | wc -l | tr -d ' ')
            if [ "$device_count" -gt 1 ]; then
                echo "Multiple devices found:"
                echo "$devices" | nl
                read -p "Enter device number: " device_number
                device_id=$(echo "$devices" | sed -n "${device_number}p")
            else
                device_id=$devices
            fi
            
            while true; do
                read -p "Enter deeplink URL for Android (or enter 'b' to go back): " deeplink_url
                if [ "$deeplink_url" = "b" ]; then
                    break
                fi
                echo "Opening deeplink on Android emulator..."
                # note: careful with changing single/double quotes here since deeplinks can contain `&` characters that need to be escaped properly
                adb -s "$device_id" shell "am start -a android.intent.action.VIEW -d '$deeplink_url'" || true
                echo ""
            done
            ;;
        b)
            exit 0
            ;;
    esac
done

