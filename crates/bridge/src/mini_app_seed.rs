//! Deterministic per-origin BIP39 seeds for mini apps in the mod browser.
//! Pure functions only; the RPC layer (`fedi-ffi`) wires them to bridge state.

use anyhow::{Context as _, bail};
use fedimint_bip39::Bip39RootSecretStrategy;
use fedimint_client::secret::RootSecretStrategy as _;
use fedimint_derive_secret::{ChildId, DerivableSecret};
use runtime::constants::MINI_APP_SEED_CHILD_ID;
use runtime::features::RuntimeEnvironment;
use url::Url;

/// An RFC 6454 origin produced by [`canonicalize_origin`] — the only type the
/// derivation accepts, so an un-canonicalized URL cannot reach it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanonicalOrigin(String);

impl CanonicalOrigin {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for CanonicalOrigin {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// Compute the canonical RFC 6454 web origin of a mini app page URL:
/// lowercase scheme and host, no default port, no userinfo, no
/// path/query/fragment. A single trailing root-label dot is removed
/// (`example.com.` names the same authority as `example.com`); hosts with any
/// other empty DNS label are rejected.
///
/// Permitted origins: `https` everywhere; `http://localhost` and
/// `http://127.0.0.1` (any port) only in Dev, Tests, and Staging.
pub fn canonicalize_origin(
    url: &str,
    runtime_env: RuntimeEnvironment,
) -> anyhow::Result<CanonicalOrigin> {
    let url = Url::parse(url).context("invalid mini app url")?;
    let scheme = url.scheme();
    let host = url.host_str().context("mini app url has no host")?;
    let host = host.strip_suffix('.').unwrap_or(host);
    // Reject, don't loop-strip: an empty label left after the single
    // root-label strip (`example.com..`) would otherwise mint a distinct
    // permanent identity next to `example.com`.
    if host.is_empty() || host.starts_with('.') || host.ends_with('.') || host.contains("..") {
        bail!("origin not permitted: host has an empty dns label");
    }
    match scheme {
        "https" => {}
        "http" => {
            let env_allows_http = matches!(
                runtime_env,
                RuntimeEnvironment::Dev | RuntimeEnvironment::Tests | RuntimeEnvironment::Staging
            );
            let is_loopback_host = matches!(host, "localhost" | "127.0.0.1");
            if !(env_allows_http && is_loopback_host) {
                bail!("origin not permitted: http is only allowed for localhost in dev builds");
            }
        }
        other => bail!("origin not permitted: unsupported scheme {other}"),
    }
    // `Url::port()` is `None` for the scheme default, matching RFC 6454.
    Ok(CanonicalOrigin(match url.port() {
        Some(port) => format!("{scheme}://{host}:{port}"),
        None => format!("{scheme}://{host}"),
    }))
}

/// Derive the 16-byte app seed for one mini app origin.
///
/// FROZEN recipe: do not change it after release; if a change is ever
/// necessary, use a new `ChildId` and keep this procedure. Deliberately
/// excluded inputs: `device_index` (all devices with the same root mnemonic
/// must derive the same app seed) and any stored randomness (wallet recovery
/// must restore every app seed).
pub fn derive_mini_app_seed(
    root_mnemonic: &bip39::Mnemonic,
    canonical_origin: &CanonicalOrigin,
) -> [u8; 16] {
    let root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(root_mnemonic);
    let branch_secret = root_secret.child_key(MINI_APP_SEED_CHILD_ID);
    // `to_random_bytes` is deterministic despite its name.
    let branch_bytes: [u8; 32] = branch_secret.to_random_bytes();
    let app_secret = DerivableSecret::new_root(&branch_bytes, canonical_origin.0.as_bytes());
    // Reserved account level, fixed at 0: keeps existing derivations stable
    // and lets per-app accounts return later without a new ChildId.
    let account_secret = app_secret.child_key(ChildId(0));
    account_secret.to_random_bytes()
}

#[cfg(test)]
mod tests {
    use RuntimeEnvironment::{Dev, Edge, Prod, Staging, Tests};

    use super::*;

    #[track_caller]
    fn assert_canonical(input: &str, env: RuntimeEnvironment, expected: &str) {
        assert_eq!(
            canonicalize_origin(input, env).expect(input).as_str(),
            expected,
            "input: {input}"
        );
    }

    #[track_caller]
    fn assert_rejected(input: &str, env: RuntimeEnvironment) {
        assert!(
            canonicalize_origin(input, env).is_err(),
            "expected rejection, input: {input}"
        );
    }

    #[test]
    fn lowercases_scheme_and_host() {
        assert_canonical(
            "HTTPS://APP.Example.COM/Path",
            Prod,
            "https://app.example.com",
        );
    }

    #[test]
    fn strips_default_port() {
        assert_canonical(
            "https://app.example.com:443/",
            Prod,
            "https://app.example.com",
        );
        assert_canonical("http://localhost:80", Dev, "http://localhost");
    }

    #[test]
    fn keeps_explicit_non_default_port() {
        assert_canonical(
            "https://app.example.com:8443",
            Prod,
            "https://app.example.com:8443",
        );
        assert_canonical("http://localhost:3000", Dev, "http://localhost:3000");
    }

    #[test]
    fn strips_trailing_dot_on_host() {
        assert_canonical("https://app.example.com./", Prod, "https://app.example.com");
        assert_canonical(
            "https://app.example.com.:443",
            Prod,
            "https://app.example.com",
        );
    }

    #[test]
    fn rejects_empty_dns_labels() {
        assert_canonical("https://example.com.", Prod, "https://example.com");
        // Only the single root-label dot is normalized; deeper empty labels
        // are rejected so they cannot become extra identities.
        assert_rejected("https://example.com..", Prod);
        assert_rejected("https://example..com", Prod);
        assert_rejected("http://localhost..", Dev);
    }

    #[test]
    fn idn_hosts_converge_to_punycode() {
        // Pins today's idna mapping: the unicode form and its punycode form
        // must keep producing the same origin (and app seed).
        assert_canonical(
            "https://münchen.example/pfad",
            Prod,
            "https://xn--mnchen-3ya.example",
        );
        assert_canonical(
            "https://xn--mnchen-3ya.example",
            Prod,
            "https://xn--mnchen-3ya.example",
        );
    }

    #[test]
    fn strips_path_query_and_fragment() {
        assert_canonical(
            "https://app.example.com/a/b?c=d#e",
            Prod,
            "https://app.example.com",
        );
    }

    #[test]
    fn rejects_non_url_input() {
        assert_rejected("", Dev);
        assert_rejected("not a url", Dev);
        assert_rejected("app.example.com", Dev);
        // No host to build an origin from.
        assert_rejected("data:text/html,hi", Dev);
        assert_rejected("file:///etc/passwd", Dev);
    }

    #[test]
    fn rejects_http_in_prod_and_edge() {
        assert_rejected("http://localhost", Prod);
        assert_rejected("http://127.0.0.1", Prod);
        assert_rejected("http://localhost", Edge);
        assert_rejected("http://127.0.0.1", Edge);
    }

    #[test]
    fn rejects_http_on_non_loopback_hosts_in_every_env() {
        for env in [Dev, Tests, Staging, Edge, Prod] {
            assert_rejected("http://app.example.com", env);
            // Trailing-dot loopback bypass must not work either way.
            assert_rejected("http://localhost.evil.com", env);
        }
    }

    #[test]
    fn accepts_http_loopback_in_dev_tests_staging() {
        for env in [Dev, Tests, Staging] {
            assert_canonical("http://localhost", env, "http://localhost");
            assert_canonical("http://127.0.0.1", env, "http://127.0.0.1");
            assert_canonical("http://localhost.:8080", env, "http://localhost:8080");
        }
    }

    #[test]
    fn rejects_unsupported_schemes() {
        assert_rejected("ws://app.example.com", Dev);
        assert_rejected("ftp://app.example.com", Dev);
    }
}

#[cfg(test)]
mod derivation_tests {
    use super::*;

    /// The standard BIP39 English test mnemonic; test fixture only.
    const TEST_ROOT_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon \
         abandon abandon abandon abandon abandon about";
    const TEST_ORIGIN: &str = "https://app.example.com";

    fn root_mnemonic() -> bip39::Mnemonic {
        bip39::Mnemonic::parse(TEST_ROOT_MNEMONIC).expect("fixture mnemonic is valid")
    }

    /// Test inputs are already canonical; round-trips them unchanged.
    fn origin(s: &str) -> CanonicalOrigin {
        let canonical = canonicalize_origin(s, RuntimeEnvironment::Dev).expect(s);
        assert_eq!(
            canonical.as_str(),
            s,
            "test origin must already be canonical"
        );
        canonical
    }

    fn hex(bytes: &[u8; 16]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    /// Pinned regression vector: freezes the derivation contract. The
    /// expected bytes are the BIP39 entropy of the originally pinned
    /// 12-word vectors, so they also prove continuity across the
    /// mnemonic-to-bytes API change. If this test fails, the derivation
    /// changed and every mini app seed in the wild would change with it.
    /// Do NOT update the expected values; fix the code instead.
    #[test]
    fn pinned_test_vector() {
        let vectors: [(&str, &str); 2] = [
            (
                "https://app.example.com",
                "96e5ea1157908a128b3dfa21a4ae6c8c",
            ),
            ("http://localhost:3000", "a6160ec0ccba70b1ca689604fe0a78fc"),
        ];
        for (origin_str, expected_hex) in vectors {
            let seed = derive_mini_app_seed(&root_mnemonic(), &origin(origin_str));
            assert_eq!(
                hex(&seed),
                expected_hex,
                "derivation contract broke for origin={origin_str}"
            );
        }
    }

    #[test]
    fn derivation_is_deterministic() {
        let a = derive_mini_app_seed(&root_mnemonic(), &origin(TEST_ORIGIN));
        let b = derive_mini_app_seed(&root_mnemonic(), &origin(TEST_ORIGIN));
        assert_eq!(a, b);
    }

    #[test]
    fn distinct_origins_give_distinct_bytes() {
        let a = derive_mini_app_seed(&root_mnemonic(), &origin("https://app.example.com"));
        let b = derive_mini_app_seed(&root_mnemonic(), &origin("https://app.example.org"));
        assert_ne!(a, b);
    }
}
