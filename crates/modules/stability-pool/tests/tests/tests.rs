use std::env;
use std::fmt::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use anyhow::bail;
use devimint::external::Bitcoind;
use devimint::federation::Federation;
use devimint::util::{Command, ProcessManager};
use devimint::{cmd, dev_fed, vars, DevFed};
use fedimint_core::module::serde_json;
use fedimint_core::secp256k1::schnorr;
use fedimint_core::task::TaskGroup;
use fedimint_core::util::write_overwrite_async;
use fedimint_core::Amount;
use stability_pool_common::{
    Account, AccountId, AccountType, ActiveDeposits, FeeRate, FiatAmount, FiatOrAll, Provide, Seek,
    SignedTransferRequest, SyncResponse, TransferRequest,
};
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
        lnd,
        fed,
        gw_lnd,
        gw_ldk,
        electrs,
        esplora,
        gw_ldk_second,
        recurringd,
    } = dev_fed(&process_mgr).await?;

    // Get clients for seeker and provider
    let (seeker, provider) =
        tokio::try_join!(ForkedClient::new("seeker"), ForkedClient::new("provider"))?;

    // Make them join the federation
    let invite_code = fed.invite_code()?;
    tokio::try_join!(
        seeker.join_federation(invite_code.clone()),
        provider.join_federation(invite_code.clone())
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
    seeker_and_provider_tests(Arc::clone(&seeker), Arc::clone(&provider)).await?;

    // Create another seeker for transfer tests
    let seeker2 = Arc::new(ForkedClient::new("seeker2").await?);
    seeker2.join_federation(invite_code).await?;
    transfer_tests(seeker, seeker2, provider).await?;

    Ok(())
}

async fn seeker_tests_isolated(seeker: Arc<ForkedClient>) -> anyhow::Result<()> {
    // Record initial ecash balance and unlocked SP balance
    let initial_ecash_balance = seeker.balance().await?;
    let initial_unlocked_sp_balance = seeker
        .get_sp_account_info(AccountType::Seeker)
        .await?
        .sync_response
        .staged_balance;

    // Try to withdraw 10 cents, expect error
    assert!(seeker
        .withdraw(AccountType::Seeker, FiatOrAll::Fiat(FiatAmount(10)))
        .await
        .is_err());

    // Deposit-to-seek
    let first_deposit_amount = Amount::from_msats(150_000);
    seeker.deposit_to_seek(first_deposit_amount.msats).await?;

    // Verify new ecash balance and new unlocked SP balance
    // Verify staged seek
    let new_ecash_balance = seeker.balance().await?;
    let new_sp_account_info = seeker.get_sp_account_info(AccountType::Seeker).await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount.msats
    );
    assert_eq!(
        new_sp_account_info.sync_response.staged_balance,
        initial_unlocked_sp_balance + first_deposit_amount
    );
    let ActiveDeposits::Seeker { staged, .. } = new_sp_account_info.active_deposits else {
        bail!("Invalid active deposits variant for seeker");
    };

    assert!(matches!(
        staged.as_slice(),
        [Seek {
            sequence: 0,
            amount,
            ..
        }] if *amount == first_deposit_amount
    ));

    // Deposit-to-seek again
    let second_deposit_amount = Amount::from_msats(250_000);
    seeker.deposit_to_seek(second_deposit_amount.msats).await?;

    // Verify new ecash balance and new unlocked SP balance
    // Verify staged seeks
    let new_ecash_balance = seeker.balance().await?;
    let new_sp_account_info = seeker.get_sp_account_info(AccountType::Seeker).await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount.msats - second_deposit_amount.msats
    );
    assert_eq!(
        new_sp_account_info.sync_response.staged_balance,
        initial_unlocked_sp_balance + first_deposit_amount + second_deposit_amount
    );
    let ActiveDeposits::Seeker { staged, .. } = new_sp_account_info.active_deposits else {
        bail!("Invalid active deposits variant for seeker");
    };

    assert!(matches!(
        staged.as_slice(),
        [Seek {
            sequence: 0,
            amount: amount1, ..
        }, Seek  {
            sequence: 1,
            amount: amount2, ..
        }] if *amount1 == first_deposit_amount && *amount2 == second_deposit_amount
    ));

    // Try to withdraw more than unlocked balance, expect error
    // Currently with Mock oracle, price of 1 BTC is 1,000,000 cents
    // So with 400,000 msats, our balance is 4 cents
    assert!(seeker
        .withdraw(AccountType::Seeker, FiatOrAll::Fiat(FiatAmount(5)))
        .await
        .is_err());

    // Withdraw less than 2nd staged seek, verify 2nd staged seek modified
    // Verify ecash balance
    let first_withdraw_amount_cents = 1;
    let first_withdraw_amount = Amount::from_msats(100_000);
    seeker
        .withdraw(
            AccountType::Seeker,
            FiatOrAll::Fiat(FiatAmount(first_withdraw_amount_cents)),
        )
        .await?;
    let new_ecash_balance = seeker.balance().await?;
    let new_sp_account_info = seeker.get_sp_account_info(AccountType::Seeker).await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount.msats - second_deposit_amount.msats
            + first_withdraw_amount.msats
    );
    assert_eq!(
        new_sp_account_info.sync_response.staged_balance,
        (initial_unlocked_sp_balance + first_deposit_amount + second_deposit_amount)
            .checked_sub(first_withdraw_amount)
            .expect("Can't fail")
    );
    let ActiveDeposits::Seeker { staged, .. } = new_sp_account_info.active_deposits else {
        bail!("Invalid active deposits variant for seeker");
    };

    assert!(matches!(
        staged.as_slice(),
        [Seek {
            sequence: 0,
            amount: amount1, ..
        }, Seek  {
            sequence: 1,
            amount: amount2, ..
        }] if *amount1 == first_deposit_amount && *amount2 == second_deposit_amount.checked_sub(first_withdraw_amount).expect("Can't fail")
    ));

    // Withdraw more than 2nd staged seek, verify 2nd staged seek removed
    // Verify ecash balance
    let second_withdraw_amount_cents = 2;
    let second_withdraw_amount = Amount::from_msats(200_000);
    seeker
        .withdraw(
            AccountType::Seeker,
            FiatOrAll::Fiat(FiatAmount(second_withdraw_amount_cents)),
        )
        .await?;

    let total_withdrawn = first_withdraw_amount + second_withdraw_amount;
    let remaining_first_deposit = first_deposit_amount
        .checked_sub(
            total_withdrawn
                .checked_sub(second_deposit_amount)
                .expect("Can't fail"),
        )
        .expect("Can't fail");
    let new_ecash_balance = seeker.balance().await?;
    let new_sp_account_info = seeker.get_sp_account_info(AccountType::Seeker).await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount.msats - second_deposit_amount.msats
            + first_withdraw_amount.msats
            + second_withdraw_amount.msats
    );
    assert_eq!(
        new_sp_account_info.sync_response.staged_balance,
        (initial_unlocked_sp_balance + first_deposit_amount + second_deposit_amount)
            .checked_sub(first_withdraw_amount)
            .expect("Can't fail")
            .checked_sub(second_withdraw_amount)
            .expect("Can't fail")
    );
    let ActiveDeposits::Seeker { staged, .. } = new_sp_account_info.active_deposits else {
        bail!("Invalid active deposits variant for seeker");
    };

    assert!(matches!(
        staged.as_slice(),
        [Seek {
            sequence: 0,
            amount: amount1, ..
        }] if *amount1 == remaining_first_deposit
    ));

    // Withdraw any remaining unlocked balance
    seeker.withdraw(AccountType::Seeker, FiatOrAll::All).await?;
    Ok(())
}

async fn provider_tests_isolated(provider: Arc<ForkedClient>) -> anyhow::Result<()> {
    // Record initial ecash balance and unlocked SP balance
    let initial_ecash_balance = provider.balance().await?;
    let initial_unlocked_sp_balance = provider
        .get_sp_account_info(AccountType::Provider)
        .await?
        .sync_response
        .staged_balance;

    // Try to withdraw 10 cents, expect error
    assert!(provider
        .withdraw(AccountType::Provider, FiatOrAll::Fiat(FiatAmount(10)))
        .await
        .is_err());

    // Deposit-to-provide
    let first_deposit_amount = Amount::from_msats(150_000);
    provider
        .deposit_to_provide(first_deposit_amount.msats, 10)
        .await?;

    // Verify new ecash balance and new unlocked SP balance
    // Verify staged provide
    let new_ecash_balance = provider.balance().await?;
    let new_sp_account_info = provider.get_sp_account_info(AccountType::Provider).await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount.msats
    );
    assert_eq!(
        new_sp_account_info.sync_response.staged_balance,
        initial_unlocked_sp_balance + first_deposit_amount
    );
    let ActiveDeposits::Provider { staged, .. } = new_sp_account_info.active_deposits else {
        bail!("Invalid active deposits variant for provider");
    };

    assert!(matches!(
        staged.as_slice(),
        [Provide {
            sequence: 2, // provider/seeker sequence is shared now
            amount,
            meta: FeeRate(10), ..
        }] if *amount == first_deposit_amount
    ));

    // Deposit-to-provide again
    let second_deposit_amount = Amount::from_msats(250_000);
    provider
        .deposit_to_provide(second_deposit_amount.msats, 20)
        .await?;

    // Verify new ecash balance and new unlocked SP balance
    // Verify staged provides
    let new_ecash_balance = provider.balance().await?;
    let new_sp_account_info = provider.get_sp_account_info(AccountType::Provider).await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount.msats - second_deposit_amount.msats
    );
    assert_eq!(
        new_sp_account_info.sync_response.staged_balance,
        initial_unlocked_sp_balance + first_deposit_amount + second_deposit_amount
    );
    let ActiveDeposits::Provider { staged, .. } = new_sp_account_info.active_deposits else {
        bail!("Invalid active deposits variant for provider");
    };

    assert!(matches!(
        staged.as_slice(),
        [Provide {
            sequence: 2,
            amount: amount1,
            meta: FeeRate(10), ..
        }, Provide  {
            sequence: 3,
            amount: amount2,
            meta: FeeRate(20), ..
        }] if *amount1 == first_deposit_amount && *amount2 == second_deposit_amount));

    // Try to withdraw more than unlocked balance, expect error
    // Currently with Mock oracle, price of 1 BTC is 1,000,000 cents
    // So with 400,000 msats, our balance is 4 cents
    assert!(provider
        .withdraw(AccountType::Provider, FiatOrAll::Fiat(FiatAmount(5)))
        .await
        .is_err());

    // Withdraw less than 2nd staged provide, verify 2nd staged provide modified
    // Verify ecash balance
    let first_withdraw_amount_cents = 1;
    let first_withdraw_amount = Amount::from_msats(100_000);
    provider
        .withdraw(
            AccountType::Provider,
            FiatOrAll::Fiat(FiatAmount(first_withdraw_amount_cents)),
        )
        .await?;
    let new_ecash_balance = provider.balance().await?;
    let new_sp_account_info = provider.get_sp_account_info(AccountType::Provider).await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount.msats - second_deposit_amount.msats
            + first_withdraw_amount.msats
    );
    assert_eq!(
        new_sp_account_info.sync_response.staged_balance,
        (initial_unlocked_sp_balance + first_deposit_amount + second_deposit_amount)
            .checked_sub(first_withdraw_amount)
            .expect("not fail")
    );
    let ActiveDeposits::Provider { staged, .. } = new_sp_account_info.active_deposits else {
        bail!("Invalid active deposits variant for provider");
    };

    assert!(matches!(
        staged.as_slice(),
        [Provide {
            sequence: 2,
            amount: amount1,
            meta: FeeRate(10), ..
        }, Provide {
            sequence: 3,
            amount: amount2,
            meta: FeeRate(20), ..
        }] if *amount1 == first_deposit_amount && *amount2 == second_deposit_amount.checked_sub(first_withdraw_amount).expect("Can't fail")));

    // Withdraw more than 2nd staged provide, verify 2nd staged provide removed
    // Verify ecash balance
    let second_withdraw_amount_cents = 2;
    let second_withdraw_amount = Amount::from_msats(200_000);
    provider
        .withdraw(
            AccountType::Provider,
            FiatOrAll::Fiat(FiatAmount(second_withdraw_amount_cents)),
        )
        .await?;

    let total_withdrawn = first_withdraw_amount + second_withdraw_amount;
    let remaining_first_deposit = first_deposit_amount
        .checked_sub(
            total_withdrawn
                .checked_sub(second_deposit_amount)
                .expect("Can't fail"),
        )
        .expect("Can't fail");
    let new_ecash_balance = provider.balance().await?;
    let new_sp_account_info = provider.get_sp_account_info(AccountType::Provider).await?;
    assert_eq!(
        new_ecash_balance,
        initial_ecash_balance - first_deposit_amount.msats - second_deposit_amount.msats
            + first_withdraw_amount.msats
            + second_withdraw_amount.msats
    );
    assert_eq!(
        new_sp_account_info.sync_response.staged_balance,
        (initial_unlocked_sp_balance + first_deposit_amount + second_deposit_amount)
            .checked_sub(first_withdraw_amount)
            .expect("Can't fail")
            .checked_sub(second_withdraw_amount)
            .expect("Can't fail")
    );
    let ActiveDeposits::Provider { staged, .. } = new_sp_account_info.active_deposits else {
        bail!("Invalid active deposits variant for provider");
    };

    assert!(matches!(
        staged.as_slice(),
        [Provide {
            sequence: 2,
            amount: amount1, ..
        }] if *amount1 == remaining_first_deposit
    ));

    // Withdraw any remaining unlocked balance
    provider
        .withdraw(AccountType::Provider, FiatOrAll::All)
        .await?;
    Ok(())
}

async fn seeker_and_provider_tests(
    seeker: Arc<ForkedClient>,
    provider: Arc<ForkedClient>,
) -> anyhow::Result<()> {
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
    let ActiveDeposits::Seeker { locked, .. } = seeker_info.active_deposits else {
        bail!("Invalid active deposits variant for seeker");
    };
    assert!(matches!(
        locked.as_slice(),
        [Seek {
            amount,
            ..
        }] if amount.msats == locked_seek_1
    ));
    let ActiveDeposits::Provider { staged, locked } = provider_info.active_deposits else {
        bail!("Invalid active deposits variant for provider");
    };
    assert!(matches!(
        staged.as_slice(),
        [Provide {
            amount, meta, ..
        }] if amount.msats == staged_provide_1 && *meta == FeeRate(provide1_min_fee_rate)
    ));
    assert!(matches!(
        locked.as_slice(),
        [Provide {
            amount, meta, ..
        }] if amount.msats == locked_provide_1 && *meta == FeeRate(provide1_min_fee_rate)
    ));
    assert_eq!(provider_info.sync_response.idle_balance.msats, fees_paid);

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
    let ActiveDeposits::Seeker { staged, locked } = seeker_info.active_deposits else {
        bail!("Invalid active deposits variant for seeker");
    };
    assert!(matches!(
        staged.as_slice(),
        [Seek {
            amount,
            ..
        }] if amount.msats == staged_seek_2
    ));
    assert!(matches!(
        locked.as_slice(),
        [Seek {
            amount: amount1,
            ..
        }, Seek {
            amount: amount2,
            ..
        }] if amount1.msats == locked_seek_1 && amount2.msats == locked_seek_2
    ));
    let ActiveDeposits::Provider { staged, locked } = provider_info.active_deposits else {
        bail!("Invalid active deposits variant for provider");
    };
    assert!(staged.is_empty());
    assert!(matches!(
        locked.as_slice(),
        [Provide {
            amount: amount1, meta: meta1, ..
        }, Provide {
            amount: amount2, meta: meta2, ..
        }] if amount1.msats == locked_provide_1 && *meta1 == FeeRate(provide1_min_fee_rate)
            && amount2.msats == locked_provide_2 && *meta2 == FeeRate(provide2_min_fee_rate)
    ));
    assert_eq!(provider_info.sync_response.idle_balance.msats, fees_paid);

    // Make seeker withdraw 4 cents, which would equal 400k msats
    seeker
        .withdraw(AccountType::Seeker, FiatOrAll::Fiat(FiatAmount(4)))
        .await?;

    // Verify locked seek and provide and fee remittance
    let (seeker_info, provider_info) = tokio::try_join!(
        seeker.get_sp_account_info(AccountType::Seeker),
        provider.get_sp_account_info(AccountType::Provider)
    )?;
    let locked_seek_2 = (staged_seek_2 + locked_seek_2) - 400_000; // after staged seek is drained, newer locked seek is drained
    let locked_provide_1 = locked_seek_1 + locked_seek_2 + 1;
    let fees_paid = fees_paid + 1 + 1; // 24ppb is 1 parts for 300_000, +1 for rounding
    let locked_seek_1 = locked_seek_1 - 1;
    let staged_provide_1 = provide1_msats - locked_provide_1;
    let staged_provide_2 = provide2_msats;
    let ActiveDeposits::Seeker { staged, locked } = seeker_info.active_deposits else {
        bail!("Invalid active deposits variant for seeker");
    };
    assert!(staged.is_empty());
    assert!(matches!(
        locked.as_slice(),
        [Seek {
            amount: amount1,
            ..
        }, Seek {
            amount: amount2,
            ..
        }] if amount1.msats == locked_seek_1 && amount2.msats == locked_seek_2
    ));
    let ActiveDeposits::Provider { staged, locked } = provider_info.active_deposits else {
        bail!("Invalid active deposits variant for provider");
    };
    assert!(matches!(
        staged.as_slice(),
        [Provide {
            amount: amount1, meta: meta1, ..
        }, Provide {
            amount: amount2, meta: meta2, ..
        }] if amount1.msats == staged_provide_1 && *meta1 == FeeRate(provide1_min_fee_rate)
            && amount2.msats == staged_provide_2 && *meta2 == FeeRate(provide2_min_fee_rate)
    ));
    assert!(matches!(
        locked.as_slice(),
        [Provide {
            amount: amount1, meta: meta1, ..
        }] if amount1.msats == locked_provide_1 && *meta1 == FeeRate(provide1_min_fee_rate)
    ));
    assert_eq!(provider_info.sync_response.idle_balance.msats, fees_paid);

    // Let provider take out accrued fees from idle balance
    let provider_info = provider
        .withdraw_idle_balance(AccountType::Provider, Amount::from_msats(fees_paid))
        .await?;
    assert!(provider_info.sync_response.idle_balance == Amount::ZERO);

    // Make seeker and provider withdraw all
    seeker.withdraw(AccountType::Seeker, FiatOrAll::All).await?;
    provider
        .withdraw(AccountType::Provider, FiatOrAll::All)
        .await?;

    Ok(())
}

async fn transfer_tests(
    seeker1: Arc<ForkedClient>,
    seeker2: Arc<ForkedClient>,
    provider: Arc<ForkedClient>,
) -> anyhow::Result<()> {
    // Make 4 separate deposits with seeker1
    seeker1.deposit_to_seek(100_000).await?;
    seeker1.deposit_to_seek(200_000).await?;
    seeker1.deposit_to_seek(300_000).await?;
    let seeker1_acc_info = seeker1.deposit_to_seek(400_000).await?;

    // Use 0 fee rate here for easy calculations since fee rates are already tested
    // separately.
    provider.deposit_to_provide(400_000, 0).await?;

    let seeker1_info = seeker1
        .wait_for_locked_seek_change(seeker1_acc_info)
        .await?;

    // Verify that seeker1's locked seeks are 100_000, 200_000, and 100_000 (partial
    // lock) and seeker1's staged seeks are 200_000 and 400_000
    let ActiveDeposits::Seeker { staged, locked } = seeker1_info.active_deposits else {
        bail!("Invalid active deposits variant for seeker");
    };
    assert!(matches!(
        staged.as_slice(),
        [Seek {
            amount: amount1,
            ..
        }, Seek {
            amount: amount2,
            ..
        }] if amount1.msats == 200_000 && amount2.msats == 400_000
    ));
    assert!(matches!(
        locked.as_slice(),
        [Seek {
            amount: amount1,
            ..
        }, Seek {
            amount: amount2,
            ..
        }, Seek {
            amount: amount3,
            ..
        }] if amount1.msats == 100_000 && amount2.msats == 200_000 && amount3.msats == 100_000
    ));

    // Transfer 800_000 (8 cents) from seeker1 to seeker2
    let signed_request = seeker1
        .simple_transfer(
            seeker2.get_account(AccountType::Seeker).await?.id(),
            FiatAmount(8),
        )
        .await?;
    seeker2.transfer(signed_request).await?;

    // Verify end state of staged and locked seeks for seeker1 and seeker2
    let seeker1_acc_info = seeker1.get_sp_account_info(AccountType::Seeker).await?;
    let seeker2_acc_info = seeker2.get_sp_account_info(AccountType::Seeker).await?;

    // Seeker1 should only be left with locked seeks of 100_000 and 100_000
    let ActiveDeposits::Seeker { staged, locked } = seeker1_acc_info.active_deposits else {
        bail!("Invalid active deposits variant for seeker");
    };
    assert!(staged.is_empty());
    assert!(matches!(
        locked.as_slice(),
        [Seek {
            amount: amount1,
            ..
        }, Seek {
            amount: amount2,
            ..
        }] if amount1.msats == 100_000 && amount2.msats == 100_000
    ));

    // Seeker2 should get both of seeker1's staged seeks as a new single staged
    // seek, as well as a new locked seek from seeker1
    let ActiveDeposits::Seeker { staged, locked } = seeker2_acc_info.active_deposits else {
        bail!("Invalid active deposits variant for seeker");
    };
    assert!(matches!(
        staged.as_slice(),
        [Seek {
            amount: amount1,
            ..
        }] if amount1.msats == 600_000
    ));
    assert!(matches!(
        locked.as_slice(),
        [Seek {
            amount: amount1,
            ..
        }] if amount1.msats == 200_000
    ));

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

    async fn get_account(&self, account_type: AccountType) -> anyhow::Result<Account> {
        let pubkey_json = cmd!(self, "module", "multi_sig_stability_pool", "pubkey",)
            .out_json()
            .await?;
        let pubkey = serde_json::from_value(pubkey_json)?;

        Ok(Account::single(pubkey, account_type))
    }

    async fn get_sp_account_info(&self, account_type: AccountType) -> anyhow::Result<AccountInfo> {
        let account_type = match account_type {
            AccountType::Seeker => "seeker",
            AccountType::Provider => "provider",
            AccountType::BtcDepositor => "btc-depositor",
        };
        let sync_response_json = cmd!(
            self,
            "module",
            "multi_sig_stability_pool",
            "account-info",
            account_type
        )
        .out_json()
        .await?;
        info!("{sync_response_json}");
        let sync_response = serde_json::from_value(sync_response_json)?;

        let active_deposits_json = cmd!(
            self,
            "module",
            "multi_sig_stability_pool",
            "active-deposits",
            account_type
        )
        .out_json()
        .await?;
        info!("{active_deposits_json}");
        let active_deposits = serde_json::from_value(active_deposits_json)?;

        Ok(AccountInfo {
            sync_response,
            active_deposits,
        })
    }

    async fn deposit_to_seek(&self, amount: u64) -> anyhow::Result<AccountInfo> {
        cmd!(
            self,
            "module",
            "multi_sig_stability_pool",
            "deposit-to-seek",
            amount
        )
        .run()
        .await?;
        self.get_sp_account_info(AccountType::Seeker).await
    }

    async fn deposit_to_provide(&self, amount: u64, fee_rate: u64) -> anyhow::Result<AccountInfo> {
        cmd!(
            self,
            "module",
            "multi_sig_stability_pool",
            "deposit-to-provide",
            amount,
            fee_rate
        )
        .run()
        .await?;
        self.get_sp_account_info(AccountType::Provider).await
    }

    async fn withdraw(
        &self,
        account_type: AccountType,
        amount: FiatOrAll,
    ) -> anyhow::Result<AccountInfo> {
        let account_type_str = match account_type {
            AccountType::Seeker => "seeker",
            AccountType::Provider => "provider",
            AccountType::BtcDepositor => "btc-depositor",
        };
        let amount = match amount {
            FiatOrAll::Fiat(fiat_amount) => fiat_amount.0.to_string(),
            FiatOrAll::All => "all".to_owned(),
        };
        cmd!(
            self,
            "module",
            "multi_sig_stability_pool",
            "withdraw",
            account_type_str,
            amount,
        )
        .run()
        .await?;
        self.get_sp_account_info(account_type).await
    }

    #[allow(unused)]
    async fn sign_transfer_request(
        &self,
        request: TransferRequest,
    ) -> anyhow::Result<schnorr::Signature> {
        let signature_json = cmd!(
            self,
            "module",
            "multi_sig_stability_pool",
            "sign-transfer",
            serde_json::to_string(&request)?,
        )
        .out_json()
        .await?;
        Ok(serde_json::from_value(signature_json)?)
    }

    async fn simple_transfer(
        &self,
        to_account: AccountId,
        amount: FiatAmount,
    ) -> anyhow::Result<SignedTransferRequest> {
        let signed_request_json = cmd!(
            self,
            "module",
            "multi_sig_stability_pool",
            "simple-transfer",
            to_account,
            amount.0.to_string(),
        )
        .out_json()
        .await?;
        Ok(serde_json::from_value(signed_request_json)?)
    }

    async fn transfer(&self, signed_request: SignedTransferRequest) -> anyhow::Result<()> {
        cmd!(
            self,
            "module",
            "multi_sig_stability_pool",
            "transfer",
            serde_json::to_string(&signed_request)?,
        )
        .out_json()
        .await?;
        Ok(())
    }

    async fn withdraw_idle_balance(
        &self,
        account_type: AccountType,
        amount: Amount,
    ) -> anyhow::Result<AccountInfo> {
        let account_type_str = match account_type {
            AccountType::Seeker => "seeker",
            AccountType::Provider => "provider",
            AccountType::BtcDepositor => "btc-depositor",
        };
        cmd!(
            self,
            "module",
            "multi_sig_stability_pool",
            "withdraw-idle-balance",
            account_type_str,
            amount,
        )
        .run()
        .await?;
        self.get_sp_account_info(account_type).await
    }

    async fn wait_for_locked_seek_change(
        &self,
        initial_account_info: AccountInfo,
    ) -> anyhow::Result<AccountInfo> {
        loop {
            let new_account_info = self.get_sp_account_info(AccountType::Seeker).await?;
            match (
                &initial_account_info.active_deposits,
                &new_account_info.active_deposits,
            ) {
                (
                    ActiveDeposits::Seeker {
                        locked: old_locked, ..
                    },
                    ActiveDeposits::Seeker {
                        locked: new_locked, ..
                    },
                ) if old_locked != new_locked => return Ok(new_account_info),
                (_, _) => tokio::time::sleep(Duration::from_secs(2)).await,
            }
        }
    }

    async fn wait_for_locked_provide_change(
        &self,
        initial_account_info: AccountInfo,
    ) -> anyhow::Result<AccountInfo> {
        loop {
            let new_account_info = self.get_sp_account_info(AccountType::Provider).await?;
            match (
                &initial_account_info.active_deposits,
                &new_account_info.active_deposits,
            ) {
                (
                    ActiveDeposits::Provider {
                        locked: old_locked, ..
                    },
                    ActiveDeposits::Provider {
                        locked: new_locked, ..
                    },
                ) if old_locked != new_locked => return Ok(new_account_info),
                (_, _) => tokio::time::sleep(Duration::from_secs(2)).await,
            }
        }
    }
}

pub struct AccountInfo {
    sync_response: SyncResponse,
    active_deposits: ActiveDeposits,
}

async fn setup() -> anyhow::Result<(ProcessManager, TaskGroup)> {
    let offline_nodes = 0;
    let globals = vars::Global::new(
        Path::new(&env::var("FM_TEST_DIR")?),
        1,
        env::var("FM_FED_SIZE")?.parse::<usize>()?,
        offline_nodes,
        None,
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
