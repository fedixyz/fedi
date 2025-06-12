use std::fmt;
use std::str::FromStr;

use bitcoin::bech32::{self, Bech32m, Hrp};
use fedimint_core::config::FederationIdPrefix;
use fedimint_core::encoding::{Decodable, Encodable};
use stability_pool_client::common::AccountId;

#[derive(Debug, Clone)]
pub struct Spv2PaymentAddress {
    pub account_id: AccountId,
    // to identity federation
    pub federation_id_prefix: FederationIdPrefix,
}

#[derive(Encodable, Decodable)]
enum Spv2PaymentAddressComponent {
    AccountId(AccountId),
    FederationIdPrefix(FederationIdPrefix),
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

        for component in data {
            match component {
                Spv2PaymentAddressComponent::AccountId(id) => {
                    account_id = Some(id);
                }
                Spv2PaymentAddressComponent::FederationIdPrefix(prefix) => {
                    federation_id_prefix = Some(prefix);
                }
                _ => {}
            }
        }

        match (account_id, federation_id_prefix) {
            (Some(account_id), Some(federation_id_prefix)) => Ok(Spv2PaymentAddress {
                account_id,
                federation_id_prefix,
            }),
            _ => anyhow::bail!("missing components in spv2 payment address"),
        }
    }
}

impl fmt::Display for Spv2PaymentAddress {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let data = vec![
            Spv2PaymentAddressComponent::AccountId(self.account_id),
            Spv2PaymentAddressComponent::FederationIdPrefix(self.federation_id_prefix),
        ]
        .consensus_encode_to_vec();
        let data = bech32::encode::<Bech32m>(HRP, &data).map_err(|_| fmt::Error)?;
        write!(f, "{}", data)
    }
}
