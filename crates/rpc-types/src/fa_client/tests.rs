use super::*; // nosemgrep: ban-wildcard-imports -- split test module

#[test]
fn fa_msat_values_are_exact_decimal_strings_in_every_fa_output_shape() {
    for value in [(1_u64 << 53) - 1, 1_u64 << 53, (1_u64 << 53) + 1, u64::MAX] {
        let decimal = value.to_string();
        let preview = RpcFaSelectionPreview {
            preview_id: "preview".to_owned(),
            selected: 1,
            total_advertised_msats: RpcFaMsats(value),
            seen: 1,
            eligible: 1,
            valid_until: 1,
            seats: vec![RpcFaSelectionPreviewSeat {
                mg_id: "fman".to_owned(),
                mg_name: "blissful-chiffchaff".to_owned(),
                advertised_price_msats: RpcFaMsats(value),
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

        let status = RpcFaStatus::Formation {
            formation: Box::new(RpcFaFormationSnapshot {
                formation_id: "formation".to_owned(),
                phase: RpcFaFormationPhase::AwaitingPaymentReadiness,
                intent: RpcFaResolvedFormationIntent {
                    federation_name: "Federation".to_owned(),
                    federation_size: 1,
                    guardian_fee_ppm: 0,
                    plan: RpcFaPlanPreference::InfiniteBestEffort,
                    max_total_msats: Some(RpcFaMsats(value)),
                },
                seats: Vec::new(),
                freshness: RpcFaFormationFreshness::Fresh,
                action_required: Some(RpcFaFormationActionRequired::AuthorizePayments {
                    requirements: RpcFaPaymentRequirements {
                        authorization_id: "authorization".to_owned(),
                        total_msats: RpcFaMsats(value),
                        max_total_msats: Some(RpcFaMsats(value)),
                        seats: vec![RpcFaSeatPaymentRequirement {
                            index: 0,
                            mg_id: None,
                            mg_name: None,
                            quote_id: "quote".to_owned(),
                            payment_federation_id: "payer".to_owned(),
                            amount_msats: RpcFaMsats(value),
                        }],
                    },
                }),
                payment_outputs_started: false,
                milestones: RpcFaFormationMilestones {
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

        let payer_json = serde_json::to_value(RpcFaEligiblePayer {
            federation_id: "payer".to_owned(),
            balance_msats: RpcFaMsats(value),
        })
        .unwrap();
        assert_eq!(payer_json["balanceMsats"].as_str(), Some(decimal.as_str()));

        let replacement_json = serde_json::to_value(RpcFaReplacementPreview {
            preview_id: "replacement-preview".to_owned(),
            requirements: RpcFaGuardianReplacementRequirements {
                replacement_id: "replacement".to_owned(),
                seats: Vec::new(),
            },
            total_advertised_msats: RpcFaMsats(value),
            seats: vec![RpcFaReplacementPreviewSeat {
                index: 0,
                mg_id: "replacement-fman".to_owned(),
                mg_name: "blissful-chiffchaff".to_owned(),
                advertised_price_msats: RpcFaMsats(value),
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

        let encoded = serde_json::to_string(&RpcFaMsats(value)).unwrap();
        assert_eq!(
            serde_json::from_str::<RpcFaMsats>(&encoded).unwrap().0,
            value
        );
    }
}

#[test]
fn fa_msat_transport_rejects_json_numbers() {
    assert!(serde_json::from_str::<RpcFaMsats>("9007199254740993").is_err());
}
