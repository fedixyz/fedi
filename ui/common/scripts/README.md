# Scripts

# `yarn run i18n:autotranslate`

Automatically sorts and translates keys in languages based on the `localization/en/common.json` file.

1. Get a Google Cloud account
2. Create a project
3. Enable the [Cloud Translation API](https://console.cloud.google.com/apis/api/translate.googleapis.com)
4. Go to the [credentials screen](https://console.cloud.google.com/apis/credentials) and create a new API Key credential
5. Run `GOOGLE_TRANSLATE_API_KEY=[key] yarn i18n:autotranslate`
    - You can add a single language as a parameter if you only want to run against one, e.g. `yarn autotranslate es`

# `yarn run i18n:export-csv <languageCode> <mode>`

Exports a CSV meant to be handed off to translators. The CSV is generated from one of the translation files, and is output at `localization/export.csv`. This file can then be imported via `yarn run i18n:import-csv`.

## Modes

-   `default` - Exports a csv file in the format `Key,Text(<languageCode>)`
-   `translate` - Exports the csv file in the format `Key,Original (English),Text(<languageCode>)` where `Text (<languageCode>)` is an empty string in every row
-   `correct` - Exports the csv file in the format `Key,Original (English),Text(<languageCode>)` where `Text (<languageCode>)` is the existing `languageCode` translation in every row

# `yarn run i18n:import-csv <languageCode> <pathToCsv>`

Imports a CSV that matches the format from `yarn run i18n:export-csv`. The first argument is a two character language code, such as `en` or `fr`. The second argument is the path to the language CSV file.

Translations are additive, and empty translation columns will be skipped, so it's perfectly safe to import a language CSV that only contains a partial set of translations.

# `yarn run i18n:unused`

Collects all localization keys and greps the codebase for them to seee if they're being used.

If no matches of a key are found, it is automatically removed from the localization files unless prefixed with an item in `protectedPrefixes`.

You can do a dry run by passing `-n` as the first argument.

```bash
yarn run i18n:unused -n
```

Doing a dry run will print out the number of unused keys found without modifying any files.
