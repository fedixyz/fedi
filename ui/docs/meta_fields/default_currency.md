# `fedi:default_currency`

3-letter ISO 4217 currency code

When set, all in-app sat amounts will default to showing conversion amounts in this currency (assuming an exchange rate is available). If a user sets a selected currency within the app settings, the user-default will be respected over this one.

Be sure to test that the string provided matches one of the currencies listed in-app to confirm that an exchange rate is available

## Structure

3-letter string

```json
"fedi:default_currency": "USD"
```
