use std::collections::BTreeMap;
use std::time::Duration;

use fedimint_api_client::api::DynGlobalApi;
use fedimint_client_module::meta::{
    FetchKind, MetaFieldKey, MetaFieldValue, MetaSource, MetaValues, fetch_meta_overrides,
};
use fedimint_core::config::ClientConfig;
use fedimint_core::util::{backoff_util, retry};
use fedimint_core::{apply, async_trait_maybe_send};

pub type MetaEntries = BTreeMap<String, String>;

/// Renders a federation metadata value as the string the app consumes.
///
/// Metadata reaches the client as arbitrary JSON. The app reads every field as
/// a string, and the fields in use hold their payload as JSON *inside* a JSON
/// string, so a string yields its own text unquoted. Any other value is
/// rendered as compact JSON, which keeps a field that is published unwrapped
/// readable instead of losing it.
pub fn meta_value_to_string(value: serde_json::Value) -> String {
    match value {
        serde_json::Value::String(string) => string,
        other => other.to_string(),
    }
}

/// Converts client metadata entries into the string-valued form the app uses.
pub fn meta_entries_from_values(
    entries: impl IntoIterator<Item = (String, serde_json::Value)>,
) -> MetaEntries {
    entries
        .into_iter()
        .map(|(key, value)| (key, meta_value_to_string(value)))
        .collect()
}

/// Legacy non-meta module config source uses client config meta and
/// meta_override_url meta field.
#[derive(Clone, Debug, Default)]
#[non_exhaustive]
pub struct LegacyMetaSourceWithExternalUrl {
    reqwest: reqwest::Client,
}

pub const META_EXTERNAL_URL_FIELD: &str = "meta_external_url";
pub const META_OVERRIDE_URL_FIELD: &str = "meta_override_url";
#[apply(async_trait_maybe_send!)]
impl MetaSource for LegacyMetaSourceWithExternalUrl {
    async fn wait_for_update(&self) {
        fedimint_core::runtime::sleep(Duration::from_secs(10 * 60)).await;
    }

    async fn fetch(
        &self,
        client_config: &ClientConfig,
        _api: &DynGlobalApi,
        fetch_kind: FetchKind,
        last_revision: Option<u64>,
    ) -> anyhow::Result<MetaValues> {
        let config_iter = client_config.global.meta.iter().map(|(key, value)| {
            (
                MetaFieldKey(key.clone()),
                MetaFieldValue(serde_json::Value::String(value.clone())),
            )
        });
        let backoff = match fetch_kind {
            // need to be fast the first time.
            FetchKind::Initial => backoff_util::aggressive_backoff(),
            FetchKind::Background => backoff_util::custom_backoff(
                Duration::from_secs(10),
                Duration::from_secs(10 * 60),
                None,
            ),
        };
        let overrides = retry("fetch_meta_overrides", backoff, || async {
            let static_meta = &client_config.global.meta;
            if static_meta.contains_key(META_OVERRIDE_URL_FIELD) {
                fetch_meta_overrides(&self.reqwest, client_config, META_OVERRIDE_URL_FIELD).await
            } else {
                fetch_meta_overrides(&self.reqwest, client_config, META_EXTERNAL_URL_FIELD).await
            }
        })
        .await?;
        Ok(MetaValues {
            values: config_iter.chain(overrides).collect(),
            revision: last_revision.map_or(0, |r| r + 1),
        })
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{meta_entries_from_values, meta_value_to_string};

    #[test]
    fn string_values_keep_their_text() {
        // The fields in use hold their payload as JSON inside a JSON string, so
        // the text has to survive unquoted for the consumers that parse it.
        assert_eq!(meta_value_to_string(json!("Fedi Alpha")), "Fedi Alpha");
        assert_eq!(meta_value_to_string(json!("2500")), "2500");
        assert_eq!(
            meta_value_to_string(json!(r#"{"version":1,"recipients":[]}"#)),
            r#"{"version":1,"recipients":[]}"#
        );
    }

    #[test]
    fn non_string_values_render_as_compact_json() {
        assert_eq!(meta_value_to_string(json!(2500)), "2500");
        assert_eq!(meta_value_to_string(json!(true)), "true");
        assert_eq!(meta_value_to_string(json!(null)), "null");
        assert_eq!(meta_value_to_string(json!(["a", "b"])), r#"["a","b"]"#);
        assert_eq!(
            meta_value_to_string(json!({"version": 1})),
            r#"{"version":1}"#
        );
    }

    #[test]
    fn a_string_of_digits_is_indistinguishable_from_the_number() {
        // Both forms have to reach `parse::<u64>()` as the same text, so a
        // federation that publishes the field unwrapped still works.
        assert_eq!(
            meta_value_to_string(json!("2500")),
            meta_value_to_string(json!(2500))
        );
    }

    #[test]
    fn entries_convert_keys_unchanged_and_values_by_rule() {
        let entries = meta_entries_from_values(vec![
            ("federation_name".to_string(), json!("Fedi Alpha")),
            ("fedi_guardian_fee_send_ppm".to_string(), json!("2500")),
            ("welcome_message".to_string(), json!(null)),
        ]);

        assert_eq!(entries.len(), 3);
        assert_eq!(entries["federation_name"], "Fedi Alpha");
        assert_eq!(entries["fedi_guardian_fee_send_ppm"], "2500");
        assert_eq!(entries["welcome_message"], "null");
    }

    #[test]
    fn string_values_are_not_double_encoded() {
        // Rendering a JSON string with `to_string` would wrap it in quotes and
        // every consumer that parses the text would fail.
        let rendered = meta_value_to_string(json!("Fedi Alpha"));
        assert!(!rendered.starts_with('"'), "value was double encoded");
    }
}
