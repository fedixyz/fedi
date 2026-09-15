import {
    WALLET_SERVICE_LIGHTNING_STAGES,
    type WalletServiceLightningStage,
    toLightningStage,
} from '../../../redux'
import type {
    RpcFiLiquidityItemPhase,
    RpcFiLiquidityOperation,
} from '../../../types/bindings'

const buildOperation = (
    overrides: Partial<RpcFiLiquidityOperation> = {},
): RpcFiLiquidityOperation => ({
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
    phase: RpcFiLiquidityItemPhase,
    overrides: Partial<RpcFiLiquidityOperation> = {},
): RpcFiLiquidityOperation =>
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
        const phases: Array<RpcFiLiquidityItemPhase> = [
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
