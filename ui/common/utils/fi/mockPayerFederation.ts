import type { Federation, MSats } from '../../types'

const SATS_TO_MSATS = 1000

/**
 * A dev-only stand-in for a joined federation that can pay for setup.
 *
 * The FI backend cannot complete a formation in dev, and the confirm step's
 * payer picker can only offer wallets the app actually holds, so without these
 * the flow stops on story 04 with an empty picker.
 *
 * `balanceSats` is what the simulator reports through `fiClientEligiblePayers`,
 * and is therefore what decides whether the flow believes the wallet can pay.
 * The `balance` on the federation itself only drives what the wallet list
 * displays.
 */
export interface MockPayerFederation {
    id: string
    name: string
    balanceSats: number
}

/**
 * The payer set from the story 04 design, so the picker and the
 * insufficient-balance state can both be exercised from one seed.
 *
 * Victoria holds nothing on purpose: an admitted zero-balance wallet is kept
 * rather than filtered out, which is what puts the shortfall banner and the
 * top-up CTA on screen.
 *
 * Pocket Change holds less than one setup on purpose: the top-up sheet's From
 * list offers only wallets that cover the amount in full, and a list where
 * everything qualifies cannot show that.
 */
export const MOCK_PAYER_FEDERATIONS: MockPayerFederation[] = [
    {
        id: 'mock-payer-global-bitcoin',
        name: 'Global Bitcoin Federation',
        balanceSats: 1_041_000,
    },
    {
        id: 'mock-payer-bitcoin-builders',
        name: 'Bitcoin Builders',
        balanceSats: 312_500,
    },
    {
        id: 'mock-payer-victoria',
        name: 'Victoria',
        balanceSats: 0,
    },
    {
        id: 'mock-payer-pocket-change',
        name: 'Pocket Change',
        balanceSats: 900,
    },
]

export const MOCK_PAYER_FEDERATION_IDS = MOCK_PAYER_FEDERATIONS.map(f => f.id)

/**
 * A dev-only stand-in for a trusted setup federation the user is *not* in.
 *
 * The real set comes from Manifold's signed setup-payment publication, and
 * every member of it carries a join invite. These stand in for the unjoined
 * part of that set, which is the only thing the join sheet may offer.
 */
export interface MockJoinableWalletService {
    id: string
    name: string
    inviteCode: string
    welcomeMessage: string
}

/**
 * Two entries on purpose, so the sheet is exercised as a list rather than as a
 * single row, and so joining one still leaves the sheet with something to show.
 *
 * The invite codes are not real. They only have to survive being carried
 * through the join call, which the simulator answers.
 */
export const MOCK_JOINABLE_WALLET_SERVICES: MockJoinableWalletService[] = [
    {
        id: 'mock-trusted-lagos-builders',
        name: 'Lagos Builders',
        inviteCode: 'fed1mock-trusted-lagos-builders',
        welcomeMessage: 'A community wallet service run from Lagos.',
    },
    {
        id: 'mock-trusted-cape-town-commons',
        name: 'Cape Town Commons',
        inviteCode: 'fed1mock-trusted-cape-town-commons',
        welcomeMessage: 'Shared savings for the Cape Town commons.',
    },
]

/**
 * Build the redux-side federation for a mock payer.
 *
 * Must be paired with `FiSimulator.addMockPayer()`, or the picker filters it
 * straight back out: the confirm step offers only ids the bridge admits.
 */
export const makeMockPayerFederation = (
    mock: MockPayerFederation,
): Federation => ({
    status: 'online',
    init_state: 'ready',
    balance: (mock.balanceSats * SATS_TO_MSATS) as MSats,
    id: mock.id,
    network: 'bitcoin',
    name: mock.name,
    inviteCode: '',
    meta: {},
    recovering: false,
    nodes: {},
    clientConfig: null,
    fediFeeSchedule: {
        modules: {},
        remittanceThresholdMsat: 10_000,
    },
    hadReusedEcash: false,
})
