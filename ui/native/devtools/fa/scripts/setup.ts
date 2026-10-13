import {
    FaScript,
    FaScriptContext,
    act,
    checkpoint,
    script,
    stub,
} from '../steps'
import { FORMATION_FROM_PAYMENT } from './formation'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** The default answer, after a pause the loading state can be seen in. */
const slow = (method: string, ms: number) =>
    stub(method, async (payload, ctx) => {
        await delay(ms)
        return ctx.world.defaultHandle(method, payload)
    })

const registryError = (message: string) => ({
    type: 'error',
    error: { code: 'registry', message, detail: null },
})

const notEnoughSeats = (requested: number, eligible: number, seen: number) => ({
    type: 'error',
    error: {
        code: 'selection',
        message: 'not enough verified manifold guardians for this size',
        detail: {
            type: 'insufficientFmanSeats',
            requested,
            selected: eligible,
            seen,
            eligible,
        },
    },
})

const requestedSize = (payload: Record<string, unknown>) =>
    (payload.request as { federationSize: number }).federationSize

export const setupHappyPath: FaScript = script('setup.happyPath', [
    checkpoint('create'),
    checkpoint('confirm'),
    ...FORMATION_FROM_PAYMENT,
])

export const setupSlowNetwork: FaScript = script('setup.slowNetwork', [
    slow('faClientPreviewSelection', 3_000),
    slow('faClientSetupPaymentFederations', 3_000),
    checkpoint('confirm'),
])

export const setupPayerLookupFails: FaScript = script(
    'setup.payerLookupFails',
    [
        stub('faClientEligiblePayers', () =>
            registryError('trusted setup payment federations unavailable'),
        ),
        checkpoint('confirm'),
    ],
)

export const setupInsufficientBalance: FaScript = script(
    'setup.insufficientBalance',
    [
        act(ctx => ctx.world.setSeatPriceMsats(1_000_000_000_000)),
        checkpoint('confirm'),
    ],
)

export const setupNoJoinableServices: FaScript = script(
    'setup.noJoinableServices',
    [
        act(ctx => ctx.world.setJoinableWalletServices([])),
        checkpoint('confirm'),
    ],
)

export const setupJoinLookupFails: FaScript = script('setup.joinLookupFails', [
    stub('faClientSetupPaymentFederations', () =>
        registryError('simulated setup-payment lookup failure'),
    ),
    checkpoint('confirm'),
])

export const setupSlowJoinLookup: FaScript = script('setup.slowJoinLookup', [
    slow('faClientSetupPaymentFederations', 6_000),
    checkpoint('confirm'),
])

export const setupNotEnoughGuardians: FaScript = script(
    'setup.notEnoughGuardians',
    [
        act(ctx => ctx.world.setFleet({ eligible: 8, seen: 11 })),
        checkpoint('create'),
    ],
)

export const setupSelectionExpiresFast: FaScript = script(
    'setup.selectionExpiresFast',
    [act(ctx => ctx.world.setPreviewValiditySecs(5)), checkpoint('confirm')],
)

export const setupReauthorizationRequired: FaScript = script(
    'setup.reauthorizationRequired',
    [
        stub('faClientPayAndCreate', () => ({
            type: 'error',
            error: {
                code: 'selectionReauthorizationRequired',
                message: 'the sealed selection is no longer valid',
                detail: {
                    type: 'selectionReauthorizationRequired',
                    reason: 'selectedFmanUnavailable',
                },
            },
        })),
        checkpoint('confirm'),
    ],
)

// a jump to the confirm screen fetches quote one and the screen's own
// mount fetches quote two, so its expiry refresh is the first quote that
// loses guardians; counted per run so a second jump starts fresh
const quotesServed = new WeakMap<FaScriptContext, number>()
export const setupQuoteRefreshLosesGuardians: FaScript = script(
    'setup.quoteRefreshLosesGuardians',
    [
        act(ctx => ctx.world.setPreviewValiditySecs(10)),
        stub('faClientPreviewSelection', (payload, ctx) => {
            const served = (quotesServed.get(ctx) ?? 0) + 1
            quotesServed.set(ctx, served)
            return served > 2
                ? notEnoughSeats(
                      requestedSize(payload),
                      requestedSize(payload) - 1,
                      42,
                  )
                : ctx.world.defaultHandle('faClientPreviewSelection', payload)
        }),
        checkpoint('confirm'),
    ],
)

export const SETUP_SCRIPTS: FaScript[] = [
    setupHappyPath,
    setupSlowNetwork,
    setupPayerLookupFails,
    setupInsufficientBalance,
    setupNoJoinableServices,
    setupJoinLookupFails,
    setupSlowJoinLookup,
    setupNotEnoughGuardians,
    setupSelectionExpiresFast,
    setupReauthorizationRequired,
    setupQuoteRefreshLosesGuardians,
]
