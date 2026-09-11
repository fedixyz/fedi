import type { RpcFiErrorCode } from '@fedi/common/types/bindings'

import { formationAt, formationStatus } from '../status'
import {
    FiScript,
    FiStep,
    act,
    checkpoint,
    formWalletService,
    script,
    stream,
    stub,
} from '../steps'

const formed: FiStep[] = [
    stream(ctx => formationStatus(formationAt(ctx, 'formed'))),
    formWalletService('ready'),
]

const liquidityError = (code: RpcFiErrorCode) => ({
    type: 'error',
    error: { code, message: 'simulated liquidity failure', detail: null },
})
const noOperation = {
    type: 'error',
    error: {
        code: 'noActiveFormation',
        message: 'no liquidity operation',
        detail: null,
    },
}

const failsWith = (code: RpcFiErrorCode): FiStep[] => [
    stub('fiClientLiquidityDiscover', () => liquidityError(code)),
    stub('fiClientLiquidityStart', () => liquidityError(code)),
]

/** Status reads that never advance the verification. */
const stuckStatus = stub('fiClientLiquidityStatus', (_, ctx) => {
    const operation = ctx.world.currentLiquidityOperation()
    return operation ? { type: 'operation', operation } : noOperation
})

const provider = (name: string, steps: FiStep[]): FiScript =>
    script(name, [...formed, ...steps, checkpoint('provider')])

export const lightningAttaches = provider('lightning.attaches', [])
export const lightningFailsRetryable = provider(
    'lightning.failsRetryable',
    failsWith('busy'),
)
export const lightningFailsTerminally = provider(
    'lightning.failsTerminally',
    failsWith('capabilityUnavailable'),
)
export const lightningNoProvider = provider('lightning.noProvider', [
    stub('fiClientLiquidityDiscover', () => ({
        type: 'discovery',
        providers: [],
        rejected: [],
    })),
])
export const lightningWrongNetwork = provider('lightning.wrongNetwork', [
    act(ctx => ctx.world.setLiquidityNetwork('bitcoin')),
])
export const lightningRejected = provider('lightning.rejected', [
    stub('fiClientLiquidityStatus', (_, ctx) => {
        const operation = ctx.world.currentLiquidityOperation()
        return operation
            ? {
                  type: 'operation',
                  operation: {
                      ...operation,
                      phase: 'rejected',
                      rejectionCode: 'intentRefused',
                  },
              }
            : noOperation
    }),
])
export const lightningNeverVerifies = provider('lightning.neverVerifies', [
    stuckStatus,
])

export const lightningAlreadyAttaching: FiScript = script(
    'lightning.alreadyAttaching',
    [
        ...formed,
        act(ctx => ctx.world.startLiquidity({ verified: false })),
        stuckStatus,
        checkpoint('settings'),
    ],
)
export const lightningAlreadyAttached: FiScript = script(
    'lightning.alreadyAttached',
    [
        ...formed,
        act(ctx => ctx.world.startLiquidity({ verified: true })),
        checkpoint('settings'),
    ],
)

export const LIGHTNING_SCRIPTS: FiScript[] = [
    lightningAttaches,
    lightningFailsRetryable,
    lightningFailsTerminally,
    lightningNoProvider,
    lightningWrongNetwork,
    lightningRejected,
    lightningNeverVerifies,
    lightningAlreadyAttaching,
    lightningAlreadyAttached,
]
