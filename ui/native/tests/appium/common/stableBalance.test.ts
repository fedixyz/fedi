/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import { setupOnboardedLocalFed } from '../fixtures/setupOnboardedLocalFed'
import {
    generateDevfedEcash,
    getDevfedInvite,
    reverseDevfedPortsIntoDevices,
} from './devfed'
import {
    assertNewestTransaction,
    depositToStableBalance,
    readWalletPrimary,
    readWalletSats,
    redeemEcash,
    switchWalletTo,
    waitForWalletReceive,
    withdrawFromStableBalance,
} from './wallet'

// Sats into the stability pool and back out again. Amounts are asserted as
// movements rather than figures. The deposit is entered in fiat and converted
// at whatever rate the app has loaded, while the pool prices the same sats off
// its own oracle, so the two dollar figures do not line up and how much a
// given withdrawal clears is not predictable.

const FUND_SATS = 20000
const DEPOSIT_USD = 2
const WITHDRAW_USD = 1

export class StableBalance extends AppiumTestBase {
    // A local fed's invite only exists at runtime, so execute() joins the
    // actor itself.
    static prerequisites = [] as const
    static produces = ['onboarded', 'walletUsed'] as const
    static actors = 1

    async execute(): Promise<void> {
        console.log('Starting StableBalance test')

        console.log('[phase0] join local fed and fund')
        await reverseDevfedPortsIntoDevices()
        await setupOnboardedLocalFed(this, await getDevfedInvite())
        await redeemEcash(this, await generateDevfedEcash(FUND_SATS * 1000))
        await this.waitForText('Ecash claimed', 0, true, 120000)
        await this.clickOnText('Go to wallet', 0, true)
        await waitForWalletReceive(this)

        // The dev fed mints with --allow-overpay, so a token is worth at least
        // what was asked for and often more. Every later check compares
        // against what actually landed.
        const spendingBefore = await readWalletSats(this)
        if (spendingBefore < FUND_SATS) {
            throw new Error(
                `spending balance is ${spendingBefore} sats after funding, expected at least ${FUND_SATS}`,
            )
        }
        await switchWalletTo(this, 'stable-balance')
        const stableBefore = await readWalletPrimary(this)
        if (stableBefore !== 0) {
            throw new Error(
                `stable balance opens at ${stableBefore}, expected 0 on a fresh account`,
            )
        }

        console.log('[phase1] deposit into stable balance')
        await depositToStableBalance(this, DEPOSIT_USD)

        // The devfed runs a 15 second pool cycle, so a deposit settles
        // inside the run.
        const stableAfterDeposit = await pollPrimary(
            this,
            v => v > stableBefore,
            'stable balance never rose after the deposit',
        )
        await assertNewestTransaction(this, {
            title: 'You deposited',
            statuses: ['Deposit', 'Pending'],
        })

        await switchWalletTo(this, 'bitcoin')
        const spendingAfterDeposit = await readWalletSats(this)
        if (spendingAfterDeposit >= spendingBefore) {
            throw new Error(
                `spending balance is ${spendingAfterDeposit} sats after depositing, expected below ${spendingBefore}`,
            )
        }
        console.log(
            `[phase1] deposited, spending ${spendingBefore} -> ${spendingAfterDeposit} sats, stable ${stableBefore} -> ${stableAfterDeposit}`,
        )

        console.log('[phase2] withdraw back to sats')
        await withdrawFromStableBalance(this, WITHDRAW_USD)

        const stableAfterWithdraw = await pollPrimary(
            this,
            v => v < stableAfterDeposit,
            'stable balance never fell after the withdrawal',
        )
        await assertNewestTransaction(this, {
            title: 'You withdrew',
            statuses: ['Withdrawal', 'Pending'],
        })

        await switchWalletTo(this, 'bitcoin')
        const spendingAfterWithdraw = await readWalletSats(this)
        if (spendingAfterWithdraw <= spendingAfterDeposit) {
            throw new Error(
                `spending balance is ${spendingAfterWithdraw} sats after withdrawing, expected above ${spendingAfterDeposit}`,
            )
        }
        console.log(
            `[phase2] withdrew, spending -> ${spendingAfterWithdraw} sats, stable -> ${stableAfterWithdraw}`,
        )
    }

    catch(error: unknown) {
        console.error('Stable balance test failed:', error)
    }
}

// Pool positions land on a cycle boundary, so the balance moves a beat after
// the success screen.
async function pollPrimary(
    t: AppiumTestBase,
    accept: (value: number) => boolean,
    failure: string,
    timeout = 120000,
): Promise<number> {
    const deadline = Date.now() + timeout
    let last = NaN
    while (Date.now() < deadline) {
        await switchWalletTo(t, 'stable-balance')
        last = await readWalletPrimary(t)
        if (accept(last)) return last
        await new Promise(r => setTimeout(r, 5000))
    }
    throw new Error(`${failure} (last read ${last})`)
}
