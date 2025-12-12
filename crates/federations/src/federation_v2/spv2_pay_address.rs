use std::fmt;
use std::str::FromStr;

use bitcoin::bech32::{self, Bech32m, Hrp};
use fedimint_core::config::FederationIdPrefix;
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::invite_code::InviteCode;
use stability_pool_client::common::AccountId;

#[derive(Debug, Clone)]
pub struct Spv2PaymentAddress {
    pub account_id: AccountId,
    // to identity federation
    pub federation_id_prefix: FederationIdPrefix,
    pub federation_invite: Option<InviteCode>,
}

#[derive(Encodable, Decodable)]
enum Spv2PaymentAddressComponent {
    AccountId(AccountId),
    FederationIdPrefix(FederationIdPrefix),
    FederationInvite(InviteCode),
    #[encodable_default]
    Default {
        variant: u64,
        bytes: Vec<u8>,
    },
}

const HRP: Hrp = Hrp::parse_unchecked("spt");

impl FromStr for Spv2PaymentAddress {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let (hrp, data) = bech32::decode(s)?;
        anyhow::ensure!(hrp == HRP, "incorrect hrp for sp payment address");
        let data: Vec<Spv2PaymentAddressComponent> =
            Decodable::consensus_decode_whole(&data, &Default::default())?;

        let mut account_id = None;
        let mut federation_id_prefix = None;
        let mut federation_invite = None;

        for component in data {
            match component {
                Spv2PaymentAddressComponent::AccountId(id) => {
                    account_id = Some(id);
                }
                Spv2PaymentAddressComponent::FederationIdPrefix(prefix) => {
                    federation_id_prefix = Some(prefix);
                }
                Spv2PaymentAddressComponent::FederationInvite(invite) => {
                    federation_invite = Some(invite);
                }
                _ => {}
            }
        }

        match (account_id, federation_id_prefix) {
            (Some(account_id), Some(federation_id_prefix)) => Ok(Spv2PaymentAddress {
                account_id,
                federation_id_prefix,
                federation_invite,
            }),
            _ => anyhow::bail!("missing components in spv2 payment address"),
        }
    }
}

impl fmt::Display for Spv2PaymentAddress {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut components = vec![
            Spv2PaymentAddressComponent::AccountId(self.account_id),
            Spv2PaymentAddressComponent::FederationIdPrefix(self.federation_id_prefix),
        ];
        if let Some(invite) = &self.federation_invite {
            components.push(Spv2PaymentAddressComponent::FederationInvite(
                invite.clone(),
            ));
        }
        let data = components.consensus_encode_to_vec();
        let data = bech32::encode::<Bech32m>(HRP, &data).map_err(|_| fmt::Error)?;
        write!(f, "{data}")
    }
}
