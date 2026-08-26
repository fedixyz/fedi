use super::*; // nosemgrep: ban-wildcard-imports -- split test module

#[test]
fn fi_msat_values_are_exact_decimal_strings_in_every_fi_output_shape() {
    for value in [(1_u64 << 53) - 1, 1_u64 << 53, (1_u64 << 53) + 1, u64::MAX] {
        let decimal = value.to_string();
        let preview = RpcFiSelectionPreview {
            preview_id: "preview".to_owned(),
            selected: 1,
            total_advertised_msats: RpcFiMsats(value),
            seen: 1,
            eligible: 1,
            valid_until: 1,
            seats: vec![RpcFiSelectionPreviewSeat {
                fman_id: "fman".to_owned(),
                fman_name: "blissful-chiffchaff".to_owned(),
                advertised_price_msats: RpcFiMsats(value),
                provenance: "verified".to_owned(),
            }],
        };
        let preview_json = serde_json::to_value(preview).unwrap();
        assert_eq!(
            preview_json["totalAdvertisedMsats"].as_str(),
            Some(decimal.as_str())
        );
        assert_eq!(
            preview_json["seats"][0]["advertisedPriceMsats"].as_str(),
            Some(decimal.as_str())
        );

        let status = RpcFiStatus::Formation {
            formation: Box::new(RpcFiFormationSnapshot {
                formation_id: "formation".to_owned(),
                phase: RpcFiFormationPhase::AwaitingPaymentReadiness,
                intent: RpcFiResolvedFormationIntent {
                    federation_name: "Federation".to_owned(),
                    federation_size: 1,
                    guardian_fee_ppm: 0,
                    plan: RpcFiPlanPreference::InfiniteBestEffort,
                    fedimintd_version: "0.11.1".to_owned(),
                    max_total_msats: Some(RpcFiMsats(value)),
                },
                seats: Vec::new(),
                freshness: RpcFiFormationFreshness::Fresh,
                action_required: Some(RpcFiFormationActionRequired::AuthorizePayments {
                    requirements: RpcFiPaymentRequirements {
                        authorization_id: "authorization".to_owned(),
                        total_msats: RpcFiMsats(value),
                        max_total_msats: Some(RpcFiMsats(value)),
                        seats: vec![RpcFiSeatPaymentRequirement {
                            index: 0,
                            fman_id: None,
                            fman_name: None,
                            quote_id: "quote".to_owned(),
                            payment_federation_id: "payer".to_owned(),
                            amount_msats: RpcFiMsats(value),
                        }],
                    },
                }),
                payment_outputs_started: false,
                milestones: RpcFiFormationMilestones {
                    ecash_sent: false,
                    guardians_confirmed: false,
                    wallet_service_created: false,
                },
                invite_code: None,
                last_error: None,
            }),
        };
        let status_json = serde_json::to_value(status).unwrap();
        let formation = &status_json["formation"];
        assert_eq!(
            formation["intent"]["maxTotalMsats"].as_str(),
            Some(decimal.as_str())
        );
        let requirements = &formation["actionRequired"]["requirements"];
        assert_eq!(requirements["totalMsats"].as_str(), Some(decimal.as_str()));
        assert_eq!(
            requirements["maxTotalMsats"].as_str(),
            Some(decimal.as_str())
        );
        assert_eq!(
            requirements["seats"][0]["amountMsats"].as_str(),
            Some(decimal.as_str())
        );

        let payer_json = serde_json::to_value(RpcFiEligiblePayer {
            federation_id: "payer".to_owned(),
            balance_msats: RpcFiMsats(value),
        })
        .unwrap();
        assert_eq!(payer_json["balanceMsats"].as_str(), Some(decimal.as_str()));

        let replacement_json = serde_json::to_value(RpcFiReplacementPreview {
            preview_id: "replacement-preview".to_owned(),
            requirements: RpcFiGuardianReplacementRequirements {
                replacement_id: "replacement".to_owned(),
                seats: Vec::new(),
            },
            total_advertised_msats: RpcFiMsats(value),
            seats: vec![RpcFiReplacementPreviewSeat {
                index: 0,
                fman_id: "replacement-fman".to_owned(),
                fman_name: "blissful-chiffchaff".to_owned(),
                advertised_price_msats: RpcFiMsats(value),
                provenance: "verified".to_owned(),
            }],
        })
        .unwrap();
        assert_eq!(
            replacement_json["totalAdvertisedMsats"].as_str(),
            Some(decimal.as_str())
        );
        assert_eq!(
            replacement_json["seats"][0]["advertisedPriceMsats"].as_str(),
            Some(decimal.as_str())
        );

        let encoded = serde_json::to_string(&RpcFiMsats(value)).unwrap();
        assert_eq!(
            serde_json::from_str::<RpcFiMsats>(&encoded).unwrap().0,
            value
        );
    }
}

#[test]
fn fi_msat_transport_rejects_json_numbers() {
    assert!(serde_json::from_str::<RpcFiMsats>("9007199254740993").is_err());
}
