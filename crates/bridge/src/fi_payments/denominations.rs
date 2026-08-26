use super::*; // nosemgrep: ban-wildcard-imports -- split private child module

// ====================== denomination selection ======================

/// Deterministic fixed-denomination breakdown used by quotes; `None` when
/// the price is not representable. Must stay byte-compatible with Manifold's
/// `fleet-manager-wallet::ecash_wallet::quote_denominations`: both protocol
/// sides predict the same paid issuance set from the same tier list.
pub(super) fn quote_denominations(price_msats: u64, available: &[Amount]) -> Option<Vec<Amount>> {
    let mut available = available.to_vec();
    available.sort_unstable_by(|a, b| b.cmp(a));
    available.dedup();
    let mut remaining = price_msats;
    let mut selected = Vec::new();
    for tier in available {
        while tier.msats != 0 && tier.msats <= remaining {
            selected.push(tier);
            remaining -= tier.msats;
        }
    }
    if remaining != 0 {
        return None;
    }
    Some(selected)
}

/// Choose refund outputs satisfying the mint transaction equation exactly.
///
/// Each candidate coin costs `denomination + output_fee(denomination)` from
/// the transaction's input side. The result uses only configured tiers and
/// equals `target_msats` exactly; it first takes large coins greedily, then
/// replaces the smallest selected coins until a bounded minimum-note dynamic
/// program can repair the fee-sized remainder. Port of Manifold's
/// `fleet-manager-wallet::locked_payment::refund_denominations`, which the
/// FMan validates our refund issuance against.
pub(super) fn refund_denominations(
    available: &[Amount],
    output_fee: impl Fn(Amount) -> Amount,
    target_msats: u64,
) -> anyhow::Result<Vec<Amount>> {
    const REPAIR_LIMIT_MSATS: u64 = 1_000_000;

    let unrepresentable =
        || anyhow!("refund amount cannot be represented exactly by fee-bearing mint tiers");
    let mut coins = available
        .iter()
        .copied()
        .filter_map(|amount| {
            amount
                .msats
                .checked_add(output_fee(amount).msats)
                .filter(|cost| *cost != 0)
                .map(|cost| (amount, cost))
        })
        .collect::<Vec<_>>();
    coins.sort_unstable_by(|(a, ac), (b, bc)| bc.cmp(ac).then_with(|| b.cmp(a)));
    coins.dedup_by_key(|(_, cost)| *cost);
    if coins.is_empty() {
        return Err(unrepresentable());
    }

    let mut selected = Vec::new();
    let mut remainder = target_msats;
    for &(amount, cost) in &coins {
        let count = remainder / cost;
        remainder %= cost;
        let count = usize::try_from(count)
            .context("refund denomination count does not fit this platform")?;
        selected.extend(std::iter::repeat_n((amount, cost), count));
    }

    loop {
        if remainder <= REPAIR_LIMIT_MSATS {
            let repair_target = usize::try_from(remainder)
                .context("bounded refund repair target does not fit this platform")?;
            if let Some(mut repair) = minimum_coin_representation(&coins, repair_target) {
                selected.append(&mut repair);
                let mut result = selected
                    .into_iter()
                    .map(|(amount, _)| amount)
                    .collect::<Vec<_>>();
                result.sort_unstable_by(|a, b| b.cmp(a));
                return Ok(result);
            }
        }
        let Some((_, cost)) = selected.pop() else {
            return Err(unrepresentable());
        };
        remainder = remainder.checked_add(cost).ok_or_else(unrepresentable)?;
        if remainder > REPAIR_LIMIT_MSATS {
            return Err(unrepresentable());
        }
    }
}

pub(super) fn minimum_coin_representation(
    coins: &[(Amount, u64)],
    target: usize,
) -> Option<Vec<(Amount, u64)>> {
    let mut counts = vec![usize::MAX; target + 1];
    let mut previous = vec![None; target + 1];
    counts[0] = 0;
    for value in 1..=target {
        for (coin_index, &(_, cost)) in coins.iter().enumerate() {
            let Ok(cost) = usize::try_from(cost) else {
                continue;
            };
            if cost <= value && counts[value - cost] != usize::MAX {
                let candidate = counts[value - cost] + 1;
                if candidate < counts[value] {
                    counts[value] = candidate;
                    previous[value] = Some((value - cost, coin_index));
                }
            }
        }
    }
    if counts[target] == usize::MAX {
        return None;
    }
    let mut result = Vec::with_capacity(counts[target]);
    let mut value = target;
    while value != 0 {
        let (prior, coin_index) = previous[value]?;
        result.push(coins[coin_index]);
        value = prior;
    }
    Some(result)
}

pub(super) fn payment_error(
    context: &'static str,
    error: impl std::fmt::Display,
) -> FiPaymentError {
    tracing::warn!(context, error = %error, "FI seat payment operation failed");
    // FiPaymentError reaches the RPC layer through FiError::Payment; keep
    // the message free of remote or wallet-internal detail.
    FiPaymentError::new(context)
}
