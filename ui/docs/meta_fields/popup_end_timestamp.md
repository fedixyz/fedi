# `fedi:popup_end_timestamp`

A UNIX timestamp in seconds after which the app will block access to this federation. The only allowed app functions after this timestamp has passed are leaving this federation and switching to a new one.

The app displays a persistent live timer counting down to this timestamp.

By setting these fields federations can warn users that this is a temporary "popup" federation and funds should be removed before the designated time.

## Structure

Base 10 encoded (stringified) integer representing the UNIX timestamp in seconds of the targeted expiration time

```json
"fedi:popup_end_timestamp": "1696312799"
```

## `fedi:popup_countdown_message`

This field must be used with `fedi:popup_end_timestamp`, otherwise it does nothing.

A message presented to users before the `fedi:popup_end_timestamp` is reached. Use this field to provide any important information around what happens to funds left in the federation after the countdown has finished.

### Structure

Human-readable string

```json
"fedi:popup_countdown_message": "Please remove your funds before the countdown. Any funds left in the federation will be donated to charity."
```

## `fedi:popup_ended_message`

This field must be used with `fedi:popup_end_timestamp`, otherwise it does nothing.

A message presented to users after the `fedi:popup_end_timestamp` has passed. Use this field to provide information to users about any funds left in the federation.

### Structure

Human-readable string

```json
"fedi:popup_ended_message": "This federation has ended. Any funds left in the federation have been donated to charity."
```
