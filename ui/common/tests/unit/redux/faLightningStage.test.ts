import { TFunction } from 'i18next'

import en from '../../../localization/en/common.json'
import {
    WALLET_SERVICE_LIGHTNING_STAGES,
    type WalletServiceLightningStage,
    getWalletServiceLightningError,
    recordFaLiquidityAbsent,
    selectFaLiquidityRejectionCode,
    selectWalletServiceLightningStage,
    selectWalletServiceLightningStatus,
    setFaLiquidityError,
    setFaLiquidityOperation,
    setupStore,
    toLightningStage,
} from '../../../redux'
import type {
    RpcFaLiquidityItemPhase,
    RpcFaLiquidityOperation,
} from '../../../types/bindings'

const buildOperation = (
    overrides: Partial<RpcFaLiquidityOperation> = {},
): RpcFaLiquidityOperation => ({
    operationId: 'op-1',
    formationId: 'formation-1',
    providerPubkey: 'pubkey-1',
    endpointHint: null,
    detailsPayloadHash: 'hash-1',
    amounts: {
        gatewayMinSats: 1000,
        gatewayMaxSats: null,
        stabilityMinSats: 0,
        stabilityMaxSats: null,
    },
    phase: 'accepted',
    itemStatuses: [],
    rejectionCode: null,
    gatewayViewVerified: false,
    ...overrides,
})

const withGatewayItem = (
    phase: RpcFaLiquidityItemPhase,
    overrides: Partial<RpcFaLiquidityOperation> = {},
): RpcFaLiquidityOperation =>
    buildOperation({
        itemStatuses: [
            {
                target: {
                    type: 'gateway',
                    itemId: 'item-1',
                    gatewayId: 'gateway-1',
                    gatewayName: 'FLIP',
                    amountSats: 150_000,
                },
                phase,
                fulfilledSats: null,
                completionEvidence: null,
                failureCode: null,
                updatedAt: 1_757_930_000,
            },
        ],
        ...overrides,
    })

describe('common/redux/fi toLightningStage', () => {
    it('should report requested when the snapshot has no item statuses yet', () => {
        expect(toLightningStage(buildOperation())).toBe('requested')
    })

    it('should report requested when no item targets a gateway', () => {
        const operation = buildOperation({
            itemStatuses: [
                {
                    target: {
                        type: 'stabilityPool',
                        itemId: 'item-1',
                        amountSats: 5_000,
                    },
                    phase: 'running',
                    fulfilledSats: null,
                    completionEvidence: null,
                    failureCode: null,
                    updatedAt: 1_757_930_000,
                },
            ],
        })

        expect(toLightningStage(operation)).toBe('requested')
    })

    it('should report requested while the gateway item is still pending', () => {
        expect(toLightningStage(withGatewayItem('pending'))).toBe('requested')
    })

    it('should report allocating while the gateway item is running', () => {
        expect(toLightningStage(withGatewayItem('running'))).toBe('allocating')
    })

    it('should report verifying once the provider reports the item completed', () => {
        expect(toLightningStage(withGatewayItem('completed'))).toBe('verifying')
    })

    it('should report actionRequired when the provider needs an operator', () => {
        expect(toLightningStage(withGatewayItem('actionRequired'))).toBe(
            'actionRequired',
        )
    })

    it('should report ready only once the gateway view is verified', () => {
        const operation = withGatewayItem('completed', {
            gatewayViewVerified: true,
        })

        expect(toLightningStage(operation)).toBe('ready')
    })

    it('should prefer ready over the item phase, since verification outranks it', () => {
        const operation = withGatewayItem('running', {
            gatewayViewVerified: true,
        })

        expect(toLightningStage(operation)).toBe('ready')
    })

    /**
     * The guard the progress line depends on. A stage that no snapshot can
     * produce renders as a row that never lights, which is how
     * `providerComplete` sat dim through every attach before it was removed.
     */
    it('should produce every stage the progress line renders', () => {
        const phases: Array<RpcFaLiquidityItemPhase> = [
            'pending',
            'running',
            'actionRequired',
            'completed',
            'failed',
            'cancelled',
        ]
        const producedStages = new Set<WalletServiceLightningStage>([
            toLightningStage(buildOperation()),
            ...phases.map(phase => toLightningStage(withGatewayItem(phase))),
            ...phases.map(phase =>
                toLightningStage(
                    withGatewayItem(phase, { gatewayViewVerified: true }),
                ),
            ),
        ])

        expect(
            [...WALLET_SERVICE_LIGHTNING_STAGES].filter(
                stage => !producedStages.has(stage),
            ),
        ).toEqual([])
    })
})

describe('common/redux/fi a rejected Lightning attach', () => {
    const rejected = buildOperation({
        phase: 'rejected',
        rejectionCode: 'insufficient_capacity',
    })
    const storeWith = (operation: RpcFaLiquidityOperation) => {
        const store = setupStore()
        store.dispatch(recordFaLiquidityAbsent())
        store.dispatch(setFaLiquidityOperation(operation))
        return store
    }

    // the stuck "Liquidity Provider requested" spinner: a rejected snapshot
    // has no gateway item, so reading it as a stage reports the first step
    it('should have no stage, since nothing is running', () => {
        const state = storeWith(rejected).getState()

        expect(selectWalletServiceLightningStatus(state)).toBe('failed')
        expect(selectWalletServiceLightningStage(state)).toBeNull()
    })

    it('should still read a stage while the request is live', () => {
        const state = storeWith(buildOperation()).getState()

        expect(selectWalletServiceLightningStatus(state)).toBe('attaching')
        expect(selectWalletServiceLightningStage(state)).toBe('requested')
    })

    it('should carry the provider reason only for a rejection', () => {
        expect(
            selectFaLiquidityRejectionCode(storeWith(rejected).getState()),
        ).toBe('insufficient_capacity')
        expect(
            selectFaLiquidityRejectionCode(
                storeWith(
                    buildOperation({ rejectionCode: 'insufficient_capacity' }),
                ).getState(),
            ),
        ).toBeNull()
    })

    it('should let a failed read outrank the rejection it would explain', () => {
        const store = storeWith(rejected)
        store.dispatch(setFaLiquidityError('busy'))

        expect(selectFaLiquidityRejectionCode(store.getState())).toBeNull()
    })
})

describe('common/redux/fi getWalletServiceLightningError', () => {
    // the English copy itself, since the copy is what this change is about
    const t = ((key: string) =>
        key
            .split('.')
            .reduce<unknown>(
                (node, part) => (node as Record<string, unknown>)?.[part],
                en,
            )) as unknown as TFunction

    it('should say the provider has no free liquidity, then invite a retry', () => {
        expect(
            getWalletServiceLightningError(t, {
                errorCode: null,
                rejectionCode: 'insufficient_capacity',
                isRetryable: true,
            }),
        ).toBe(
            'Your Liquidity Provider has no free liquidity right now. Please try again.',
        )
    })

    it('should explain an expired request', () => {
        expect(
            getWalletServiceLightningError(t, {
                errorCode: null,
                rejectionCode: 'request_expired',
                isRetryable: true,
            }),
        ).toBe(
            'Your request to the Liquidity Provider expired before it went through. Please try again.',
        )
    })

    it('should fall back to a plain refusal for a code it does not know', () => {
        expect(
            getWalletServiceLightningError(t, {
                errorCode: null,
                rejectionCode: 'policy_mismatch',
                isRetryable: true,
            }),
        ).toBe(
            'Your Liquidity Provider turned down the request. Please try again.',
        )
    })

    it.each(['constructor', 'toString', '__proto__'])(
        'should fall back to a plain refusal for the inherited name %s',
        rejectionCode => {
            expect(
                getWalletServiceLightningError(t, {
                    errorCode: null,
                    rejectionCode,
                    isRetryable: true,
                }),
            ).toBe(
                'Your Liquidity Provider turned down the request. Please try again.',
            )
        },
    )

    it('should keep the setup error for a failed RPC', () => {
        expect(
            getWalletServiceLightningError(t, {
                errorCode: 'capabilityUnavailable',
                rejectionCode: null,
                isRetryable: false,
            }),
        ).not.toMatch(/Liquidity Provider/)
    })
})
