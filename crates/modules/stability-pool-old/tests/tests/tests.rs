use std::env;
use std::fmt::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use anyhow::anyhow;
use devimint::external::Bitcoind;
use devimint::federation::Federation;
use devimint::util::{Command, ProcessManager};
use devimint::{cmd, dev_fed, vars, DevFed};
use fedimint_core::task::TaskGroup;
use fedimint_core::util::write_overwrite_async;
use tokio::fs;
use tracing::{debug, info};

#[tokio::test(flavor = "multi_thread")]
async fn starter_test() -> anyhow::Result<()> {
    let (process_mgr, _) = setup().await?;

    let (seeker_peg_in_sats, provider_peg_in_sats) = (10_000u64, 15_000u64);
    let (seeker_peg_in_msats, provider_peg_in_msats) =
        (seeker_peg_in_sats * 1000, provider_peg_in_sats * 1000);

    #[allow(unused_variables)]
    let DevFed {
        bitcoind,
        cln,
        lnd,
        fed,
        gw_lnd,
        gw_ldk,
        electrs,
        esplora,
    } = dev_fed(&process_mgr).await?;

    // Get clients for seeker and provider
    let (seeker, provider) =
        tokio::try_join!(ForkedClient::new("seeker"), ForkedClient::new("provider"))?;

    // Make them join the federation
    let invite_code = fed.invite_code()?;
    tokio::try_join!(
        seeker.join_federation(invite_code.clone()),
        provider.join_federation(invite_code)
    )?;

    // Peg in for seeker and provider and verify balances
    fed.await_block_sync().await?;
    let (seeker_peg_in_op_id, provider_peg_in_op_id) = tokio::try_join!(
        seeker.initiate_peg_in(&fed, &bitcoind, seeker_peg_in_sats),
        provider.initiate_peg_in(&fed, &bitcoind, provider_peg_in_sats)
    )?;
    bitcoind.mine_blocks(30).await?;
    tokio::try_join!(
        seeker.await_peg_in_complete(&seeker_peg_in_op_id),
        provider.await_peg_in_complete(&provider_peg_in_op_id),
    )?;
    assert_eq!(
        tokio::try_join!(seeker.balance(), provider.balance())?,
        (seeker_peg_in_msats, provider_peg_in_msats)
    );

    let (seeker, provider) = (Arc::new(seeker), Arc::new(provider));
    seeker_tests_isolated(Arc::clone(&seeker)).await?;
    provider_tests_isolated(Arc::clone(&provider)).await?;

    // 1 seek and 1 provide, excess provide liquidity
    let seek1_msats = 200_000;
    let provide1_msats = 500_000;
    let provide1_min_fee_rate = 24;
    let (seeker_acc_info, provider_acc_info) = tokio::try_join!(
        seeker.deposit_to_seek(seek1_msats),
        provider.deposit_to_provide(provide1_msats, provide1_min_fee_rate)
    )?;

    // Verify locked seek and provide and fee remittance
    let (seeker_info, provider_info) = tokio::try_join!(
        seeker.wait_for_locked_seek_change(seeker_acc_info),
        provider.wait_for_locked_provide_change(provider_acc_info)
    )?;

    let fees_paid = 1; // 24ppb means 1 part for 200k (ceiling division)
    let locked_seek_1 = seek1_msats - fees_paid;
    let locked_provide_1 = locked_seek_1 + 1; // overcollateralization due to ceiling division
    let staged_provide_1 = provide1_msats - locked_provide_1;
    assert_eq!(
        seeker_info,
        AccountInfo {
            idle_balance: 0,
            staged_seeks: vec![],
            staged_provides: vec![],
            locked_seeks: vec![LockedSeek {
                staged_sequence: seeker_info.locked_seeks[0].staged_sequence,
                amount: locked_seek_1
            }],
            locked_provides: vec![]
        }
    );
    assert_eq!(
        provider_info,
        AccountInfo {
            idle_balance: fees_paid,
            staged_seeks: vec![],
            staged_provides: vec![StagedProvide {
                sequence: provider_info.staged_provides[0].sequence,
                amount: staged_provide_1,
                min_fee_rate: provide1_min_fee_rate
            }],
            locked_seeks: vec![],
            locked_provides: vec![LockedProvide {
                staged_sequence: provider_info.locked_provides[0].staged_sequence,
                staged_min_fee_rate: provide1_min_fee_rate,
                amount: locked_provide_1,
            }]
        }
    );
    assert!(provider_info.locked_provides_total() >= seeker_info.locked_seeks_total());
    assert_eq!(
        seek1_msats + provide1_msats,
        seeker_info.total_balance() + provider_info.total_balance()
    );

    // 1 more seek and 1 more provide, but insufficient provider liquidity
    let seek2_msats = 500_000;
    let provide2_msats = 100_000;
    let provide2_min_fee_rate = 50;
    let (seeker_acc_info, provider_acc_info) = tokio::try_join!(
        seeker.deposit_to_seek(seek2_msats),
        provider.deposit_to_provide(provide2_msats, provide2_min_fee_rate)
    )?;

    // Verify locked seek and provide and fee remittance
    let (seeker_info, provider_info) = tokio::try_join!(
        seeker.wait_for_locked_seek_change(seeker_acc_info),
        provider.wait_for_locked_provide_change(provider_acc_info)
    )?;

    let fees_paid = fees_paid + 1 + 1; // 50ppb is 1 part for 600_000 (ceiling division), +1 for rounding
    let locked_seek_1 = locked_seek_1 - 1; // -1 for fee
    let locked_seek_2 = provide1_msats + provide2_msats - locked_seek_1 - 1 - 1; // -1 for fee, and -1 for rounding
    let staged_seek_2 = seek2_msats - locked_seek_2 - 1;
    let locked_provide_1 = provide1_msats;
    let locked_provide_2 = provide2_msats;
    assert_eq!(
        seeker_info,
        AccountInfo {
            idle_balance: 0,
            staged_seeks: vec![StagedSeek {
                sequence: seeker_info.staged_seeks[0].sequence,
                amount: staged_seek_2
            }],
            staged_provides: vec![],
            locked_seeks: vec![
                LockedSeek {
                    staged_sequence: seeker_info.locked_seeks[0].staged_sequence,
                    amount: locked_seek_1
                },
                LockedSeek {
                    staged_sequence: seeker_info.locked_seeks[1].staged_sequence,
                    amount: locked_seek_2
                }
            ],
            locked_provides: vec![]
        }
    );
    assert_eq!(
        provider_info,
        AccountInfo {
            idle_balance: fees_paid,
            staged_seeks: vec![],
            staged_provides: vec![],
            locked_seeks: vec![],
            locked_provides: vec![
                LockedProvide {
                    staged_sequence: provider_info.locked_provides[0].staged_sequence,
                    staged_min_fee_rate: provide1_min_fee_rate,
                    amount: locked_provide_1,
                },
                LockedProvide {
                    staged_sequence: provider_info.locked_provides[1].staged_sequence,
                    staged_min_fee_rate: provide2_min_fee_rate,
                    amount: locked_provide_2,
                }
            ]
        }
    );
    assert!(provider_info.locked_provides_total() >= seeker_info.locked_seeks_total());
    assert_eq!(
        seek1_msats + provide1_msats + seek2_msats + provide2_msats,
        seeker_info.total_balance() + provider_info.total_balance()
    );

    // Make seeker withdraw 50% of locked balance
    // Should fail because there exists a staged seek that must first be
    // withdrawn
    assert!(seeker.withdraw(0, 5_000).await.is_err());

    // Make seeker withdraw unlocked balance first, and then cancel auto renewal
    let seeker_withdrawn = seeker_info.total_unlocked_balance();
    seeker.withdraw(seeker_withdrawn, 5_000).await?;

    // Verify locked seek and provide and fee remittance
    let (seeker_info, provider_info) =
        tokio::try_join!(seeker.get_sp_account_info(), provider.get_sp_account_info())?;
    let seeker_canceled_withdrawn = (locked_seek_1 + locked_seek_2) / 2;
    let locked_seek_2 = locked_seek_2 - seeker_canceled_withdrawn; // cancellation comes out of later seek
    let locked_provide_1 = locked_seek_1 + locked_seek_2 - 1 + 1; // 24ppb is 1 parts for 300_000, +1 for rounding
    let fees_paid = fees_paid + 1 + 1; // 24ppb is 1 parts for 300_000, +1 for rounding
    let locked_seek_1 = locked_seek_1 - 1;
    let locked_seek_2 = locked_seek_2 - 1; // extra -1 from ceil division
    let staged_provide_1 = provide1_msats - locked_provide_1;
    let staged_provide_2 = provide2_msats;
    assert_eq!(
        seeker_info,
        AccountInfo {
            idle_balance: 0,
            staged_seeks: vec![],
            staged_provides: vec![],
            locked_seeks: vec![
                LockedSeek {
                    staged_sequence: seeker_info.locked_seeks[0].staged_sequence,
                    amount: locked_seek_1
                },
                LockedSeek {
                    staged_sequence: seeker_info.locked_seeks[1].staged_sequence,
                    amount: locked_seek_2
                }
            ],
            locked_provides: vec![]
        }
    );
    assert_eq!(
        provider_info,
        AccountInfo {
            idle_balance: fees_paid,
            staged_seeks: vec![],
            staged_provides: vec![
                StagedProvide {
                    sequence: provider_info.staged_provides[0].sequence,
                    amount: staged_provide_1,
                    min_fee_rate: provide1_min_fee_rate
                },
                StagedProvide {
                    sequence: provider_info.staged_provides[1].sequence,
                    amount: staged_provide_2,
                    min_fee_rate: provide2_min_fee_rate
                }
            ],
            locked_seeks: vec![],
            locked_provides: vec![LockedProvide {
                staged_sequence: provider_info.locked_provides[0].staged_sequence,
                staged_min_fee_rate: provide1_min_fee_rate,
                amount: locked_provide_1,
            },]
        }
    );
    assert!(provider_info.locked_provides_total() >= seeker_info.locked_seeks_total());
    assert_eq!(
        seek1_msats + provide1_msats + seek2_msats + provide2_msats,
        seeker_info.total_balance()
            + provider_info.total_balance()
            + seeker_withdrawn
            + seeker_canceled_withdrawn
    );

    // Let provider take out their unlocked balances
    let provider_withdrawn = provider_info.total_unlocked_balance();
    tokio::try_join!(provider.withdraw(provider_info.total_unlocked_balance(), 0))?;

    // Wait for one last cycle change
    // Verify locked seek and provide and fee remittance
    let (seeker_info, provider_info) = tokio::try_join!(
        seeker.wait_for_locked_seek_change(seeker.get_sp_account_info().await?),
        provider.wait_for_locked_provide_change(provider.get_sp_account_info().await?)
    )?;

    let fees_paid = 1 + 1; // 24ppb is 1 parts for 300_000, +1 for rounding
    let locked_provide_1 = locked_seek_1 + locked_seek_2 - 1 + 1; // 24ppb is 1 parts for 300_000, +1 for rounding
    let locked_seek_1 = locked_seek_1 - 1;
    let locked_seek_2 = locked_seek_2 - 1; // extra -1 from ceil division
    let staged_provide_1 = 2; // excess after fee reduced the locked seeks
    assert_eq!(
        seeker_info,
        AccountInfo {
            idle_balance: 0,
            staged_seeks: vec![],
            staged_provides: vec![],
            locked_seeks: vec![
                LockedSeek {
                    staged_sequence: seeker_info.locked_seeks[0].staged_sequence,
                    amount: locked_seek_1
                },
                LockedSeek {
                    staged_sequence: seeker_info.locked_seeks[1].staged_sequence,
                    amount: locked_seek_2
                }
            ],
            locked_provides: vec![]
        }
    );
    assert_eq!(
        provider_info,
        AccountInfo {
            idle_balance: fees_paid,
            staged_seeks: vec![],
            staged_provides: vec![StagedProvide {
                sequence: provider_info.staged_provides[0].sequence,
                amount: staged_provide_1,
                min_fee_rate: provide1_min_fee_rate
            }],
            locked_seeks: vec![],
            locked_provides: vec![LockedProvide {
                staged_sequence: provider_info.locked_provides[0].staged_sequence,
                staged_min_fee_rate: provide1_min_fee_rate,
                amount: locked_provide_1,
            },]
        }
    );
    assert!(provider_info.locked_provides_total() >= seeker_info.locked_seeks_total());
    assert_eq!(
        seek1_msats + provide1_msats + seek2_msats + provide2_msats,
        seeker_info.total_balance()
            + provider_info.total_balance()
            + seeker_withdrawn
            + seeker_canceled_withdrawn
            + provider_withdrawn
    );

    Ok(())
}

async fn seeker_tests_isolated(seeker: Arc<ForkedClient>) -> anyhow::Result<()> {
    // Record initial ecash balance and unlocked SP balance
    let initial_ecash_balance = seeker.balance().await?;
    let initial_unlocked_sp_balance = seeker.get_sp_account_info().await?.total_unlocked_balance();

    // Try to withdraw, expect error
    assert!(seeker.withdraw(10_000, 0).await.is_err());

    // Deposit-to-seek
    let first_deposit_amount = 150_000;
    seeker.deposit_to_seek(first_deposit_amount).await?;

    // Verify new ecash balance and new unlocked SP balance
    // Verify staged seek
    let new_ecash_balance = seeker.balance().await?;
    let new_sp_account_info = seeker.get_sp_account_info().await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount
    );
    assert_eq!(
        new_sp_account_info.total_unlocked_balance(),
        initial_unlocked_sp_balance + first_deposit_amount
    );
    assert!(matches!(
        new_sp_account_info.staged_seeks.as_slice(),
        [StagedSeek {
            sequence: 0,
            amount
        }] if *amount == first_deposit_amount
    ));

    // Deposit-to-seek again
    let second_deposit_amount = 250_000;
    seeker.deposit_to_seek(second_deposit_amount).await?;

    // Verify new ecash balance and new unlocked SP balance
    // Verify staged seeks
    let new_ecash_balance = seeker.balance().await?;
    let new_sp_account_info = seeker.get_sp_account_info().await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount - second_deposit_amount
    );
    assert_eq!(
        new_sp_account_info.total_unlocked_balance(),
        initial_unlocked_sp_balance + first_deposit_amount + second_deposit_amount
    );
    assert!(matches!(
        new_sp_account_info.staged_seeks.as_slice(),
        [StagedSeek {
            sequence: 0,
            amount: amount1
        }, StagedSeek  {
            sequence: 1,
            amount: amount2
        }] if *amount1 == first_deposit_amount && *amount2 == second_deposit_amount
    ));

    // Try to provide, expect error
    assert!(seeker.deposit_to_provide(500_000, 100).await.is_err());

    // Try to withdraw more than unlocked balance, expect error
    assert!(seeker.withdraw(initial_ecash_balance, 0).await.is_err());

    // Withdraw less than 2nd staged seek, verify 2nd staged seek modified
    // Verify ecash balance
    let first_withdraw_amount = 50_000;
    seeker.withdraw(first_withdraw_amount, 0).await?;
    let new_ecash_balance = seeker.balance().await?;
    let new_sp_account_info = seeker.get_sp_account_info().await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount - second_deposit_amount
            + first_withdraw_amount
    );
    assert_eq!(
        new_sp_account_info.total_unlocked_balance(),
        initial_unlocked_sp_balance + first_deposit_amount + second_deposit_amount
            - first_withdraw_amount
    );
    assert!(matches!(
        new_sp_account_info.staged_seeks.as_slice(),
        [StagedSeek {
            sequence: 0,
            amount: amount1
        }, StagedSeek  {
            sequence: 1,
            amount: amount2
        }] if *amount1 == first_deposit_amount && *amount2 == second_deposit_amount - first_withdraw_amount
    ));

    // Withdraw more than 2nd staged seek, verify 2nd staged seek removed
    // Verify ecash balance
    let second_withdraw_amount = 250_000;
    seeker.withdraw(second_withdraw_amount, 0).await?;

    let total_withdrawn = first_withdraw_amount + second_withdraw_amount;
    let remaining_first_deposit = first_deposit_amount - (total_withdrawn - second_deposit_amount);
    let new_ecash_balance = seeker.balance().await?;
    let new_sp_account_info = seeker.get_sp_account_info().await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount - second_deposit_amount
            + first_withdraw_amount
            + second_withdraw_amount
    );
    assert_eq!(
        new_sp_account_info.total_unlocked_balance(),
        initial_unlocked_sp_balance + first_deposit_amount + second_deposit_amount
            - first_withdraw_amount
            - second_withdraw_amount
    );
    assert!(matches!(
        new_sp_account_info.staged_seeks.as_slice(),
        [StagedSeek {
            sequence: 0,
            amount: amount1
        }] if *amount1 == remaining_first_deposit
    ));

    // Withdraw any remaining unlocked balance
    seeker
        .withdraw(new_sp_account_info.total_unlocked_balance(), 0)
        .await?;
    Ok(())
}

async fn provider_tests_isolated(provider: Arc<ForkedClient>) -> anyhow::Result<()> {
    // Record initial ecash balance and unlocked SP balance
    let initial_ecash_balance = provider.balance().await?;
    let initial_unlocked_sp_balance = provider
        .get_sp_account_info()
        .await?
        .total_unlocked_balance();

    // Try to withdraw, expect error
    assert!(provider.withdraw(10_000, 0).await.is_err());

    // Deposit-to-provide
    let first_deposit_amount = 150_000;
    provider
        .deposit_to_provide(first_deposit_amount, 10)
        .await?;

    // Verify new ecash balance and new unlocked SP balance
    // Verify staged provide
    let new_ecash_balance = provider.balance().await?;
    let new_sp_account_info = provider.get_sp_account_info().await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount
    );
    assert_eq!(
        new_sp_account_info.total_unlocked_balance(),
        initial_unlocked_sp_balance + first_deposit_amount
    );
    assert!(matches!(
        new_sp_account_info.staged_provides.as_slice(),
        [StagedProvide {
            sequence: 0,
            amount,
            min_fee_rate: 10
        }] if *amount == first_deposit_amount
    ));

    // Deposit-to-provide again
    let second_deposit_amount = 250_000;
    provider
        .deposit_to_provide(second_deposit_amount, 20)
        .await?;

    // Verify new ecash balance and new unlocked SP balance
    // Verify staged provides
    let new_ecash_balance = provider.balance().await?;
    let new_sp_account_info = provider.get_sp_account_info().await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount - second_deposit_amount
    );
    assert_eq!(
        new_sp_account_info.total_unlocked_balance(),
        initial_unlocked_sp_balance + first_deposit_amount + second_deposit_amount
    );
    assert!(matches!(
        new_sp_account_info.staged_provides.as_slice(),
        [StagedProvide {
            sequence: 0,
            amount: amount1,
            min_fee_rate: 10,
        }, StagedProvide  {
            sequence: 1,
            amount: amount2,
            min_fee_rate: 20,
        }] if *amount1 == first_deposit_amount && *amount2 == second_deposit_amount
    ));

    // Try to seek, expect error
    assert!(provider.deposit_to_seek(500_000).await.is_err());

    // Try to withdraw more than unlocked balance, expect error
    assert!(provider.withdraw(initial_ecash_balance, 0).await.is_err());

    // Withdraw less than 2nd staged provide, verify 2nd staged provide modified
    // Verify ecash balance
    let first_withdraw_amount = 50_000;
    provider.withdraw(first_withdraw_amount, 0).await?;
    let new_ecash_balance = provider.balance().await?;
    let new_sp_account_info = provider.get_sp_account_info().await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount - second_deposit_amount
            + first_withdraw_amount
    );
    assert_eq!(
        new_sp_account_info.total_unlocked_balance(),
        initial_unlocked_sp_balance + first_deposit_amount + second_deposit_amount
            - first_withdraw_amount
    );
    assert!(matches!(
        new_sp_account_info.staged_provides.as_slice(),
        [StagedProvide {
            sequence: 0,
            amount: amount1,
            min_fee_rate: 10,
        }, StagedProvide {
            sequence: 1,
            amount: amount2,
            min_fee_rate: 20,
        }] if *amount1 == first_deposit_amount && *amount2 == second_deposit_amount - first_withdraw_amount
    ));

    // Withdraw more than 2nd staged provide, verify 2nd staged provide removed
    // Verify ecash balance
    let second_withdraw_amount = 250_000;
    provider.withdraw(second_withdraw_amount, 0).await?;

    let total_withdrawn = first_withdraw_amount + second_withdraw_amount;
    let remaining_first_deposit = first_deposit_amount - (total_withdrawn - second_deposit_amount);
    let new_ecash_balance = provider.balance().await?;
    let new_sp_account_info = provider.get_sp_account_info().await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount - second_deposit_amount
            + first_withdraw_amount
            + second_withdraw_amount
    );
    assert_eq!(
        new_sp_account_info.total_unlocked_balance(),
        initial_unlocked_sp_balance + first_deposit_amount + second_deposit_amount
            - first_withdraw_amount
            - second_withdraw_amount
    );
    assert!(matches!(
        new_sp_account_info.staged_provides.as_slice(),
        [StagedProvide {
            sequence: 0,
            amount: amount1,
            min_fee_rate: 10,
        }] if *amount1 == remaining_first_deposit
    ));

    // Withdraw any remaining unlocked balance
    provider
        .withdraw(new_sp_account_info.total_unlocked_balance(), 0)
        .await?;
    Ok(())
}

struct ForkedClient {
    name: String,
    data_dir_path: PathBuf,
}

impl ForkedClient {
    async fn new(name: &str) -> anyhow::Result<ForkedClient> {
        let workdir: PathBuf = env::var("FM_DATA_DIR")?.parse()?;
        let client_dir = workdir.join("clients").join(name);

        std::fs::create_dir_all(&client_dir)?;
        Ok(ForkedClient {
            name: name.to_string(),
            data_dir_path: client_dir,
        })
    }

    pub fn cmd(&self) -> Command {
        cmd!(
            "fedimint-cli",
            format!("--data-dir={}", self.data_dir_path.display())
        )
    }

    async fn join_federation(&self, invite_code: String) -> anyhow::Result<()> {
        cmd!(self, "join-federation", invite_code).run().await
    }

    async fn balance(&self) -> anyhow::Result<u64> {
        Ok(cmd!(self, "info").out_json().await?["total_amount_msat"]
            .as_u64()
            .unwrap())
    }

    async fn initiate_peg_in(
        &self,
        fed: &Federation,
        bitcoind: &Bitcoind,
        amount: u64,
    ) -> anyhow::Result<String> {
        let deposit_fees = fed.deposit_fees()?;
        info!(self.name, amount, "Peg-in");
        let deposit = cmd!(self, "deposit-address").out_json().await?;
        let deposit_address = deposit["address"].as_str().unwrap();
        let deposit_operation_id = deposit["operation_id"].as_str().unwrap();

        bitcoind
            .send_to(
                deposit_address.to_owned(),
                amount + deposit_fees.msats / 1000,
            )
            .await?;
        Ok(deposit_operation_id.to_string())
    }

    async fn await_peg_in_complete(&self, deposit_operation_id: &str) -> anyhow::Result<()> {
        cmd!(self, "await-deposit", deposit_operation_id)
            .run()
            .await?;
        Ok(())
    }

    async fn get_sp_account_info(&self) -> anyhow::Result<AccountInfo> {
        let cmd_out_json = cmd!(self, "module", "stability_pool", "account-info",)
            .out_json()
            .await?;
        info!("{cmd_out_json}");

        let account_info = cmd_out_json
            .as_object()
            .ok_or(anyhow!("couldn't transform json value into object"))?
            .get("account_info")
            .ok_or(anyhow!("key account_info not found"))?;

        let idle_balance = account_info["idle_balance"]
            .as_u64()
            .ok_or(anyhow!("key idle_balance not found"))?;

        let staged_seeks = account_info["staged_seeks"]
            .as_array()
            .ok_or(anyhow!("key staged_seeks not found"))?
            .iter()
            .map(|staged_seek_json| StagedSeek {
                sequence: staged_seek_json["sequence"]
                    .as_u64()
                    .expect("key sequence must exist inside staged seek"),
                amount: staged_seek_json["seek"]
                    .as_u64()
                    .expect("key seek must exist inside staged seek"),
            })
            .collect();

        let staged_provides = account_info["staged_provides"]
            .as_array()
            .ok_or(anyhow!("key staged_provides not found"))?
            .iter()
            .map(|staged_provide_json| {
                let sequence = staged_provide_json["sequence"]
                    .as_u64()
                    .expect("key sequence must exist inside staged provide");
                let provide_json = staged_provide_json["provide"]
                    .as_object()
                    .expect("key provide must exist inside staged provide");
                StagedProvide {
                    sequence,
                    amount: provide_json["amount"]
                        .as_u64()
                        .expect("key amount must exist inside provide"),
                    min_fee_rate: provide_json["min_fee_rate"]
                        .as_u64()
                        .expect("key min_fee_rate must exist inside provide"),
                }
            })
            .collect();

        let locked_seeks = account_info["locked_seeks"]
            .as_array()
            .ok_or(anyhow!("key locked_seeks not found"))?
            .iter()
            .map(|locked_seek_json| LockedSeek {
                staged_sequence: locked_seek_json["staged_sequence"]
                    .as_u64()
                    .expect("key staged_sequence must exist inside locked seek"),
                amount: locked_seek_json["amount"]
                    .as_u64()
                    .expect("key amount must exist inside locked seek"),
            })
            .collect();

        let locked_provides = account_info["locked_provides"]
            .as_array()
            .ok_or(anyhow!("key locked_provides not found"))?
            .iter()
            .map(|locked_provide_json| LockedProvide {
                staged_sequence: locked_provide_json["staged_sequence"]
                    .as_u64()
                    .expect("key staged_sequence must exist inside locked provide"),
                staged_min_fee_rate: locked_provide_json["staged_min_fee_rate"]
                    .as_u64()
                    .expect("key staged_min_fee_rate must exist inside locked provide"),
                amount: locked_provide_json["amount"]
                    .as_u64()
                    .expect("key amount must exist inside locked provide"),
            })
            .collect();
        Ok(AccountInfo {
            idle_balance,
            staged_seeks,
            staged_provides,
            locked_seeks,
            locked_provides,
        })
    }

    async fn deposit_to_seek(&self, amount: u64) -> anyhow::Result<AccountInfo> {
        cmd!(self, "module", "stability_pool", "deposit-to-seek", amount)
            .run()
            .await?;
        self.get_sp_account_info().await
    }

    async fn deposit_to_provide(&self, amount: u64, fee_rate: u64) -> anyhow::Result<AccountInfo> {
        cmd!(
            self,
            "module",
            "stability_pool",
            "deposit-to-provide",
            amount,
            fee_rate
        )
        .run()
        .await?;
        self.get_sp_account_info().await
    }

    async fn withdraw(&self, unlocked_amount: u64, locked_bps: u32) -> anyhow::Result<()> {
        cmd!(
            self,
            "module",
            "stability_pool",
            "withdraw",
            unlocked_amount,
            locked_bps
        )
        .run()
        .await?;
        Ok(())
    }

    async fn wait_for_locked_seek_change(
        &self,
        initial_account_info: AccountInfo,
    ) -> anyhow::Result<AccountInfo> {
        loop {
            let new_account_info = self.get_sp_account_info().await?;
            if new_account_info.locked_seeks != initial_account_info.locked_seeks {
                return Ok(new_account_info);
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }

    async fn wait_for_locked_provide_change(
        &self,
        initial_account_info: AccountInfo,
    ) -> anyhow::Result<AccountInfo> {
        loop {
            let new_account_info = self.get_sp_account_info().await?;
            if new_account_info.locked_provides != initial_account_info.locked_provides {
                return Ok(new_account_info);
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }
}

#[derive(Debug, PartialEq)]
struct AccountInfo {
    idle_balance: u64,
    staged_seeks: Vec<StagedSeek>,
    staged_provides: Vec<StagedProvide>,
    locked_seeks: Vec<LockedSeek>,
    locked_provides: Vec<LockedProvide>,
}

impl AccountInfo {
    fn total_unlocked_balance(&self) -> u64 {
        self.idle_balance + self.staged_seeks_total() + self.staged_provides_total()
    }

    fn staged_seeks_total(&self) -> u64 {
        self.staged_seeks.iter().map(|s| s.amount).sum()
    }

    fn staged_provides_total(&self) -> u64 {
        self.staged_provides.iter().map(|p| p.amount).sum()
    }

    fn locked_seeks_total(&self) -> u64 {
        self.locked_seeks.iter().map(|s| s.amount).sum()
    }

    fn locked_provides_total(&self) -> u64 {
        self.locked_provides.iter().map(|p| p.amount).sum()
    }

    fn total_balance(&self) -> u64 {
        self.total_unlocked_balance() + self.locked_seeks_total() + self.locked_provides_total()
    }
}

#[derive(Debug, PartialEq)]
struct StagedSeek {
    sequence: u64,
    amount: u64,
}

#[derive(Debug, PartialEq)]
struct StagedProvide {
    sequence: u64,
    amount: u64,
    min_fee_rate: u64,
}

#[derive(Debug, PartialEq)]
struct LockedSeek {
    staged_sequence: u64,
    amount: u64,
}

#[derive(Debug, PartialEq)]
struct LockedProvide {
    staged_sequence: u64,
    staged_min_fee_rate: u64,
    amount: u64,
}

async fn setup() -> anyhow::Result<(ProcessManager, TaskGroup)> {
    let offline_nodes = 0;
    let globals = vars::Global::new(
        Path::new(&env::var("FM_TEST_DIR")?),
        env::var("FM_FED_SIZE")?.parse::<usize>()?,
        offline_nodes,
    )
    .await?;
    let log_file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .append(true)
        .open(globals.FM_LOGS_DIR.join("devimint.log"))
        .await?
        .into_std()
        .await;

    fedimint_logging::TracingSetup::default()
        .with_file(Some(log_file))
        .init()?;

    let mut env_string = String::new();
    for (var, value) in globals.vars() {
        debug!(var, value, "Env variable set");
        writeln!(env_string, r#"export {var}="{value}""#)?; // hope that value doesn't contain a "
        std::env::set_var(var, value);
    }
    write_overwrite_async(globals.FM_TEST_DIR.join("env"), env_string).await?;
    info!("Test setup in {:?}", globals.FM_DATA_DIR);
    let process_mgr = ProcessManager::new(globals);
    let task_group = TaskGroup::new();
    task_group.install_kill_handler();
    Ok((process_mgr, task_group))
}
