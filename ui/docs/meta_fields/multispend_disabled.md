# `fedi:multispend_disabled`

Boolean value that disables bitcoin multispend features.

The app enables multispend only when this field is set to `"false"` and the federation exposes the multispend module. If the field is missing or set to `"true"`, multispend is disabled.

## Structure

(stringified) boolean

```json
"fedi:multispend_disabled": "true" // defaults to "true"
```
