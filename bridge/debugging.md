## Getting logs messages from android

1. `export FEDI_DEV_LOGS=1` **before** building the bridge.
2. run `adb exec-out 'tail -f -n +1 /storage/emulated/0/Download/fedi-*.log'` in a different terminal to get the logs.

## Filtering fedi.log files

```sh
jq -C 'select(.level=="ERROR", .level=="WARN", .level="INFO")' < /tmp/fedi.log | less -R -S
```
