import {
    FiScript,
    FiScriptContext,
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
        message: 'not enough verified fleet managers for this size',
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

export const setupHappyPath: FiScript = script('setup.happyPath', [
    checkpoint('create'),
    checkpoint('confirm'),
    ...FORMATION_FROM_PAYMENT,
])

export const setupSlowNetwork: FiScript = script('setup.slowNetwork', [
    slow('fiClientPreviewSelection', 3_000),
    slow('fiClientSetupPaymentFederations', 3_000),
    checkpoint('confirm'),
])

export const setupPayerLookupFails: FiScript = script(
    'setup.payerLookupFails',
    [
        stub('fiClientEligiblePayers', () =>
            registryError('trusted setup payment federations unavailable'),
        ),
        checkpoint('confirm'),
    ],
)

export const setupInsufficientBalance: FiScript = script(
    'setup.insufficientBalance',
    [
        act(ctx => ctx.world.setSeatPriceMsats(1_000_000_000_000)),
        checkpoint('confirm'),
    ],
)

export const setupNoJoinableServices: FiScript = script(
    'setup.noJoinableServices',
    [
        act(ctx => ctx.world.setJoinableWalletServices([])),
        checkpoint('confirm'),
    ],
)

export const setupJoinLookupFails: FiScript = script('setup.joinLookupFails', [
    stub('fiClientSetupPaymentFederations', () =>
        registryError('simulated setup-payment lookup failure'),
    ),
    checkpoint('confirm'),
])

export const setupSlowJoinLookup: FiScript = script('setup.slowJoinLookup', [
    slow('fiClientSetupPaymentFederations', 6_000),
    checkpoint('confirm'),
])

export const setupNotEnoughGuardians: FiScript = script(
    'setup.notEnoughGuardians',
    [
        act(ctx => ctx.world.setFleet({ eligible: 8, seen: 11 })),
        checkpoint('create'),
    ],
)

export const setupSelectionExpiresFast: FiScript = script(
    'setup.selectionExpiresFast',
    [act(ctx => ctx.world.setPreviewValiditySecs(5)), checkpoint('confirm')],
)

export const setupReauthorizationRequired: FiScript = script(
    'setup.reauthorizationRequired',
    [
        stub('fiClientPayAndCreate', () => ({
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
const quotesServed = new WeakMap<FiScriptContext, number>()
export const setupQuoteRefreshLosesGuardians: FiScript = script(
    'setup.quoteRefreshLosesGuardians',
    [
        act(ctx => ctx.world.setPreviewValiditySecs(10)),
        stub('fiClientPreviewSelection', (payload, ctx) => {
            const served = (quotesServed.get(ctx) ?? 0) + 1
            quotesServed.set(ctx, served)
            return served > 2
                ? notEnoughSeats(
                      requestedSize(payload),
                      requestedSize(payload) - 1,
                      42,
                  )
                : ctx.world.defaultHandle('fiClientPreviewSelection', payload)
        }),
        checkpoint('confirm'),
    ],
)

export const SETUP_SCRIPTS: FiScript[] = [
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
