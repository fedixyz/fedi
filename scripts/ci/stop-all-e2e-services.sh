#!/usr/bin/env bash

set -e

echo "Stopping Android emulators"
if [ -f "$APPIUM_HOME/android_emulator_pids.txt" ]; then
  while read -r pid; do
    echo "Stopping Android emulator (PID: $pid)"
    kill -9 $pid && echo "Stopped Android emulator (PID: $pid)" || echo "Failed to stop Android emulator (PID: $pid) (may already be stopped)"
  done < "$APPIUM_HOME/android_emulator_pids.txt"
fi
QEMU_PIDS=$(ps aux | grep qemu-system-x86_64 | grep -v grep | awk '{print $2}')
if [ -n "$QEMU_PIDS" ]; then
  kill -9 $QEMU_PIDS && echo "Killed qemu-system-x86_64" || echo "Failed to kill qemu-system-x86_64"
else
  echo "Failed to kill qemu-system-x86_64 (may not be running)"
fi
adb devices || true

echo "Stopping iOS simulators"
xcrun simctl shutdown all && echo "Issued shutdown to all iOS simulators" || echo "Failed to shutdown iOS simulators (may already be off)"
SIMULATOR_PIDS=$(ps aux | grep Simulator | grep -v grep | awk '{print $2}')
if [ -n "$SIMULATOR_PIDS" ]; then
  kill -9 $SIMULATOR_PIDS && echo "Killed Simulator app" || echo "Failed to kill Simulator app"
else
  echo "Failed to kill Simulator app (may not be running)"
fi
xcrun simctl list devices | grep "Booted" || echo "No simulators running"

echo "Stopping Appium server"
if [ -f "$APPIUM_HOME/appium_pid.txt" ]; then
  APPIUM_PID=$(cat "$APPIUM_HOME/appium_pid.txt")
  echo "Stopping Appium server (PID: $APPIUM_PID)"
  kill -9 $APPIUM_PID && echo "Stopped Appium server (PID: $APPIUM_PID)" || echo "Failed to stop Appium server (PID: $APPIUM_PID) (may already be stopped)"
fi
APPIUM_PIDS=$(ps aux | grep appium | grep -v grep | awk '{print $2}')
if [ -n "$APPIUM_PIDS" ]; then
  kill -9 $APPIUM_PIDS && echo "Killed Appium processes" || echo "Failed to kill Appium processes"
else
  echo "Failed to kill Appium processes (may not be running)"
fi

echo "Stopping Metro server"
if [ -f "$APPIUM_HOME/metro_pid.txt" ]; then
  METRO_PID=$(cat "$APPIUM_HOME/metro_pid.txt")
  echo "Stopping Metro server (PID: $METRO_PID)"
  kill -9 $METRO_PID && echo "Stopped Metro server (PID: $METRO_PID)" || echo "Failed to stop Metro server (PID: $METRO_PID) (may already be stopped)"
fi
NODE_PIDS=$(ps aux | grep node | grep -v grep | awk '{print $2}')
if [ -n "$NODE_PIDS" ]; then
  kill -9 $NODE_PIDS && echo "Killed Node processes (Metro)" || echo "Failed to kill Node processes for Metro"
else
  echo "Failed to kill Node processes for Metro (may not be running)"
fi
