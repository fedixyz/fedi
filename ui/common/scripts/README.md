# Scripts

## `yarn run i18n:autotranslate`

Automatically sorts and translates keys in languages based on the `localization/en/common.json` file.

1. Get a Google Cloud account
2. Create a project
3. Enable the [Cloud Translation API](https://console.cloud.google.com/apis/api/translate.googleapis.com)
4. Go to the [credentials screen](https://console.cloud.google.com/apis/credentials) and create a new API Key credential
5. Run `GOOGLE_TRANSLATE_API_KEY=[key] yarn autotranslate`
    - You can add a single language as a parameter if you only want to run against one, e.g. `yarn autotranslate es`

# `yarn run i18n:export-csv`

Exports a CSV meant to be handed off to translators. The CSV is generated from `localization/en/common.json`, and is output at `localization/export.csv`. This file can then be imported via `yarn run i18n:import-csv`.

# `yarn run i18n:import-csv <languageCode> <pathToCsv>`

Imports a CSV that matches the format from `yarn run i18n:export-csv`. The first argument is a two character language code, such as `en` or `fr`. The second argument is the path to the language CSV file.

Translations are additive, and empty translation columns will be skipped, so it's perfectly safe to import a language CSV that only contains a partial set of translations.
