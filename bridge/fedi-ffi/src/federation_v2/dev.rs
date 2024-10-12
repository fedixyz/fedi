/// This file contains some utilities for overriding `127.0.0.1` making it
/// possible to run devimint on host machine and connect to it from Android
/// emulator
use std::str::FromStr;

use fedimint_core::config::ClientConfig;
use fedimint_core::invite_code::InviteCode;
use fedimint_core::util::SafeUrl;
use tracing::info;

// FIXME: don't run this code in production
pub fn override_localhost(url: &SafeUrl) -> SafeUrl {
    let fedi_localhost_env_var: Option<&'static str> = option_env!("FEDI_LOCALHOST");
    let fedi_localhost = if cfg!(target_os = "android") {
        Some("10.0.2.2")
    } else if cfg!(target_os = "ios") {
        Some("localhost")
    } else {
        None
    };
    let fedi_localhost = fedi_localhost_env_var.or(fedi_localhost);
    if let Some(fedi_localhost) = fedi_localhost {
        let url = SafeUrl::from_str(&url.to_string().replace("127.0.0.1", fedi_localhost)).unwrap();
        info!("Overriding 127.0.0.1->{:?}", url);
        url
    } else {
        info!("not overrideing url, {:?}", url);
        url.clone()
    }
}

pub fn override_localhost_invite_code(invite_code: &mut InviteCode) {
    *invite_code = InviteCode::new(
        override_localhost(&invite_code.url()),
        invite_code.peer(),
        invite_code.federation_id(),
        invite_code.api_secret(),
    );
}

pub fn override_localhost_client_config(client_config: &mut ClientConfig) {
    let endpoints = client_config.global.api_endpoints.clone();
    client_config.global.api_endpoints = endpoints
        .into_iter()
        .map(|(peer_id, mut peer_url)| {
            peer_url.url = override_localhost(&peer_url.url);
            (peer_id, peer_url)
        })
        .collect();
}
