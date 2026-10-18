use std::time::Duration;

use bitcoin::secp256k1::{PublicKey, Secp256k1, SecretKey};
use fedimint_ln_common::{LightningGateway, LightningGatewayAnnouncement};
use lightning_invoice::RoutingFees;
use tokio::sync::Mutex;

use super::{GatewayFeePolicy, LnGatewayService};

fn gateway(
    index: u8,
    ttl: u64,
    base_msat: u32,
    proportional_millionths: u32,
) -> LightningGatewayAnnouncement {
    let key = PublicKey::from_secret_key(
        &Secp256k1::new(),
        &SecretKey::from_slice(&[index; 32]).unwrap(),
    );
    LightningGatewayAnnouncement {
        info: LightningGateway {
            federation_index: u64::from(index),
            gateway_redeem_key: key,
            node_pub_key: key,
            lightning_alias: format!("gateway-{index}"),
            api: "https://gateway.example/v1".parse().unwrap(),
            route_hints: vec![],
            fees: RoutingFees {
                base_msat,
                proportional_millionths,
            },
            gateway_id: key,
            supports_private_payments: false,
        },
        vetted: false,
        auth: None,
        ttl: Duration::from_secs(ttl),
    }
}

fn select(
    gateways: Vec<LightningGatewayAnnouncement>,
    vetted: &[PublicKey],
    excluded: Option<PublicKey>,
    policy: GatewayFeePolicy,
) -> Vec<LightningGatewayAnnouncement> {
    LnGatewayService::filter_selectable_gateways(
        gateways,
        &vetted.iter().copied().collect(),
        excluded,
        policy,
    )
}

#[test]
fn send_fee_components_have_independent_inclusive_limits() {
    for (base, rate) in [(0, 0), (100_000, 0), (0, 15_000), (100_000, 15_000)] {
        assert_eq!(
            select(
                vec![gateway(1, 60, base, rate)],
                &[],
                None,
                GatewayFeePolicy::Send
            )
            .len(),
            1
        );
    }
    for (base, rate) in [(100_001, 0), (0, 15_001), (u32::MAX, 0), (0, u32::MAX)] {
        assert!(
            select(
                vec![gateway(1, 60, base, rate)],
                &[],
                None,
                GatewayFeePolicy::Send
            )
            .is_empty()
        );
    }
}

#[test]
fn send_eligibility_preserves_native_fee_rounding() {
    use fedimint_ln_common::config::FeeToAmount as _;

    let gateways = select(
        vec![gateway(1, 60, 100_000, 15_000)],
        &[],
        None,
        GatewayFeePolicy::Send,
    );
    let amount = fedimint_core::Amount::from_msats(1_000_000);
    assert_eq!(
        gateways[0].info.fees.to_amount(&amount).msats,
        100_000 + amount.msats / 66,
    );
}

#[test]
fn ineligible_vetted_gateway_leaves_unvetted_alternative() {
    let alternative = gateway(2, 60, 1_000, 100);
    for vetted in [
        gateway(1, 0, 1_000, 100),
        gateway(1, 30, 1_000, 100),
        gateway(1, 60, 100_001, 0),
        gateway(1, 60, 0, 15_001),
    ] {
        assert_eq!(
            select(
                vec![vetted.clone(), alternative.clone()],
                &[vetted.info.gateway_id],
                None,
                GatewayFeePolicy::Send
            ),
            vec![alternative.clone()],
        );
    }
}

#[test]
fn retry_exclusion_precedes_vetted_preference() {
    let vetted = gateway(1, 60, 1_000, 100);
    let alternative = gateway(2, 60, 1_000, 100);
    assert_eq!(
        select(
            vec![vetted.clone(), alternative.clone()],
            &[vetted.info.gateway_id],
            Some(vetted.info.gateway_id),
            GatewayFeePolicy::Send
        ),
        vec![alternative],
    );
}

#[test]
fn eligible_vetted_gateway_still_has_preference() {
    let vetted = gateway(1, 31, 100_000, 15_000);
    let unvetted = gateway(2, 60, 0, 0);
    assert_eq!(
        select(
            vec![unvetted, vetted.clone()],
            &[vetted.info.gateway_id],
            None,
            GatewayFeePolicy::Send
        ),
        vec![vetted],
    );
}

#[test]
fn receive_and_remittance_keep_existing_fee_eligibility() {
    let vetted = gateway(1, 60, u32::MAX, u32::MAX);
    let unvetted = gateway(2, 60, 0, 0);
    assert_eq!(
        select(
            vec![unvetted, vetted.clone()],
            &[vetted.info.gateway_id],
            None,
            GatewayFeePolicy::Unrestricted
        ),
        vec![vetted],
    );
}

#[tokio::test]
async fn payment_override_must_be_eligible() {
    let service = LnGatewayService {
        last_gateway: Mutex::new(None),
    };
    let over_limit = gateway(1, 60, 0, 15_001);
    let eligible = gateway(2, 60, 0, 0);
    let candidates = select(
        vec![over_limit.clone(), eligible.clone()],
        &[],
        None,
        GatewayFeePolicy::Send,
    );
    assert!(
        service
            .choose_gateway(candidates.clone(), Some(over_limit.info.gateway_id))
            .await
            .is_err()
    );
    assert_eq!(
        service
            .choose_gateway(candidates, Some(eligible.info.gateway_id))
            .await
            .unwrap(),
        Some(eligible.info),
    );
}

#[tokio::test]
async fn eligible_gateways_keep_round_robin_order() {
    let service = LnGatewayService {
        last_gateway: Mutex::new(None),
    };
    let mut gateways = vec![gateway(1, 60, 0, 0), gateway(2, 60, 0, 0)];
    gateways.sort_by_key(|g| g.info.gateway_id);
    for expected in [0, 1, 0] {
        assert_eq!(
            service
                .choose_gateway(gateways.clone(), None)
                .await
                .unwrap(),
            Some(gateways[expected].info.clone()),
        );
    }
    assert_eq!(service.choose_gateway(vec![], None).await.unwrap(), None);
}

#[cfg(feature = "test-support")]
#[test]
fn test_transport_filter_precedes_vetted_preference() {
    let mut vetted = gateway(1, 60, 0, 0);
    vetted.info.api = "iroh://gateway.example".parse().unwrap();
    let alternative = gateway(2, 60, 0, 0);
    assert_eq!(
        select(
            vec![vetted.clone(), alternative.clone()],
            &[vetted.info.gateway_id],
            None,
            GatewayFeePolicy::Send
        ),
        vec![alternative],
    );
}
