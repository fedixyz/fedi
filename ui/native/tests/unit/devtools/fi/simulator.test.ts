import { MSats } from '@fedi/common/types'
import {
    FiFederationJoinEvent,
    GuardianStatus,
    RpcFederationPreview,
    RpcFiClientStatus,
    RpcFiCurrentLiquidityOperationResult,
    RpcFiEligiblePayersResult,
    RpcFiFederationJoinState,
    RpcFiLiquidityDiscoveryResult,
    RpcFiLiquidityOperationResult,
    RpcFiOperationResult,
    RpcFiSelectionPreviewResult,
    RpcFiSetupPaymentFederationsResult,
    RpcFiStatus,
    RpcParseInviteCodeResult,
} from '@fedi/common/types/bindings'

import {
    MOCK_PAYER_FEDERATION_IDS,
    MOCK_PAYER_FEDERATIONS,
} from '../../../../devtools/fi/mockPayerFederation'
import { FiSimulator } from '../../../../devtools/fi/simulator'
import {
    formationAt,
    formationStatus,
    withAuthorization,
    withError,
    withUnsynced,
} from '../../../../devtools/fi/status'
import type { FiWalletServiceJoin } from '../../../../devtools/fi/steps'

const PREVIEW_REQUEST = {
    federationSize: 10,
    plan: 'infiniteBestEffort' as const,
}

const preview = (simulator: FiSimulator, federationSize = 10) =>
    simulator.handle('fiClientPreviewSelection', {
        request: { ...PREVIEW_REQUEST, federationSize },
    }) as Promise<RpcFiSelectionPreviewResult>

const status = (simulator: FiSimulator) =>
    simulator.handle('fiClientStatus', {}) as Promise<RpcFiClientStatus>

describe('FiSimulator', () => {
    beforeEach(() => {
        jest.useFakeTimers()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('routing', () => {
        it('should claim simulated fiClient methods', () => {
            const simulator = new FiSimulator()

            expect(simulator.handles('fiClientStatus', {})).toBe(true)
            expect(simulator.handles('fiClientPayAndCreate', {})).toBe(true)
            expect(simulator.handles('fiClientScheduleReset', {})).toBe(false)
        })

        it('should not claim unrelated bridge methods', () => {
            const simulator = new FiSimulator()

            expect(simulator.handles('generateInvoice', {})).toBe(false)
            expect(simulator.handles('joinFederation', {})).toBe(false)
        })

        it('should claim streamCancel only for a stream it issued', async () => {
            const simulator = new FiSimulator()
            await simulator.handle('fiClientSubscribe', { streamId: 7 })

            expect(simulator.handles('streamCancel', { streamId: 7 })).toBe(
                true,
            )
            expect(simulator.handles('streamCancel', { streamId: 8 })).toBe(
                false,
            )
        })
    })

    describe('eligible payers', () => {
        it('should admit a mock payer the app has never really joined', async () => {
            const simulator = new FiSimulator()
            simulator.clearMockPayers()
            simulator.observeFederations([
                { id: 'real-fed', balance: 1_000 as MSats },
            ])
            simulator.addMockPayer('mock-payer-federation', 50_000)

            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result.type).toBe('payers')
            if (result.type !== 'payers') return
            expect(result.payers.map(p => p.federationId)).toEqual([
                'mock-payer-federation',
            ])
        })

        it('should keep the mock payer when the real federation list is replaced', async () => {
            const simulator = new FiSimulator()
            simulator.clearMockPayers()
            simulator.addMockPayer('mock-payer-federation', 50_000)
            simulator.observeFederations([
                { id: 'real-fed', balance: 1_000 as MSats },
            ])

            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result.type).toBe('payers')
            if (result.type !== 'payers') return
            expect(result.payers.map(p => p.federationId)).toContain(
                'mock-payer-federation',
            )
        })

        it('should drop the mock payer when it is cleared', async () => {
            const simulator = new FiSimulator()
            simulator.addMockPayer('mock-payer-federation', 50_000)

            simulator.clearMockPayers()
            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result).toEqual({ type: 'payers', payers: [] })
        })

        it('should report each mock payer at its own balance', async () => {
            const simulator = new FiSimulator()
            simulator.clearMockPayers()
            simulator.addMockPayer('mock-funded', 312_500)
            simulator.addMockPayer('mock-empty', 0)

            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result.type).toBe('payers')
            if (result.type !== 'payers') return
            expect(result.payers).toEqual([
                { federationId: 'mock-funded', balanceMsats: '312500000' },
                { federationId: 'mock-empty', balanceMsats: '0' },
            ])
        })

        it('should keep a zero-balance mock payer, so the shortfall can be shown', async () => {
            const simulator = new FiSimulator()
            simulator.clearMockPayers()
            simulator.addMockPayer('mock-empty', 0)

            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result.type).toBe('payers')
            if (result.type !== 'payers') return
            expect(result.payers.map(p => p.federationId)).toEqual([
                'mock-empty',
            ])
        })

        it('should replace the balance when a mock payer is added twice', async () => {
            const simulator = new FiSimulator()
            simulator.clearMockPayers()
            simulator.addMockPayer('mock-funded', 1_000)
            simulator.addMockPayer('mock-funded', 2_000)

            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result.type).toBe('payers')
            if (result.type !== 'payers') return
            expect(result.payers).toEqual([
                { federationId: 'mock-funded', balanceMsats: '2000000' },
            ])
        })

        it('should keep a wallet joined mid-flow after the real federation list is refreshed', async () => {
            const simulator = new FiSimulator()
            simulator.setPayerSource('real')
            simulator.observeJoinedFederation('sim-joined')
            simulator.observeFederations([
                { id: 'real-1', balance: 5_000_000 as MSats },
            ])

            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result.type).toBe('payers')
            if (result.type !== 'payers') return
            expect(result.payers.map(p => p.federationId)).toEqual(
                expect.arrayContaining(['real-1', 'sim-joined']),
            )
        })

        it('should still wholesale-replace real ids absent from the latest refresh', async () => {
            const simulator = new FiSimulator()
            simulator.setPayerSource('real')
            simulator.observeFederations([
                { id: 'real-stale', balance: 1_000 as MSats },
            ])
            simulator.observeFederations([
                { id: 'real-1', balance: 5_000_000 as MSats },
            ])

            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result.type).toBe('payers')
            if (result.type !== 'payers') return
            expect(result.payers.map(p => p.federationId)).not.toContain(
                'real-stale',
            )
        })
    })

    describe('payer source', () => {
        const payers = (simulator: FiSimulator) =>
            simulator.handle(
                'fiClientEligiblePayers',
                {},
            ) as Promise<RpcFiEligiblePayersResult>

        it('should admit the mock payers at their seeded balance when the source is mock', async () => {
            const simulator = new FiSimulator()
            simulator.setPayerSource('mock')
            const result = await payers(simulator)
            expect(result).toEqual({
                type: 'payers',
                payers: MOCK_PAYER_FEDERATIONS.map(p => ({
                    federationId: p.id,
                    balanceMsats: String(p.balanceSats * 1000),
                })),
            })
        })

        it('should admit every joined wallet at its real balance when the source is real', async () => {
            const simulator = new FiSimulator()
            simulator.setPayerSource('real')
            simulator.observeFederations([
                { id: 'fed-a', balance: 5_000_000 as MSats },
                { id: 'fed-b', balance: 0 as MSats },
            ])
            await expect(payers(simulator)).resolves.toEqual({
                type: 'payers',
                payers: [
                    { federationId: 'fed-a', balanceMsats: '5000000' },
                    { federationId: 'fed-b', balanceMsats: '0' },
                ],
            })
        })

        it('should admit nobody when the source is none, whatever is joined', async () => {
            const simulator = new FiSimulator()
            simulator.setPayerSource('none')
            simulator.observeFederations([
                { id: 'fed-a', balance: 5_000_000 as MSats },
            ])
            await expect(payers(simulator)).resolves.toEqual({
                type: 'payers',
                payers: [],
            })
        })

        it('should admit a wallet joined during the session under the real source', async () => {
            const simulator = new FiSimulator()
            simulator.setPayerSource('real')
            simulator.observeFederations([])
            simulator.observeJoinedFederation('fed-new')
            await expect(payers(simulator)).resolves.toEqual({
                type: 'payers',
                payers: [{ federationId: 'fed-new', balanceMsats: '0' }],
            })
        })

        it('should drop the mock payers when the source leaves mock', () => {
            const simulator = new FiSimulator()
            simulator.setPayerSource('mock')
            expect(simulator.listMockFederations()).toHaveLength(
                MOCK_PAYER_FEDERATIONS.length,
            )
            simulator.setPayerSource('real')
            expect(simulator.listMockFederations()).toHaveLength(0)
        })

        it('should price a seat above any balance when the world says so', async () => {
            const simulator = new FiSimulator()
            simulator.setSeatPriceMsats(1_000_000_000_000)
            simulator.setPayerSource('mock')
            const result = await preview(simulator)
            expect(result.type).toBe('preview')
            if (result.type !== 'preview') return
            const richest =
                Math.max(...MOCK_PAYER_FEDERATIONS.map(p => p.balanceSats)) *
                1000
            expect(Number(result.preview.totalAdvertisedMsats)).toBeGreaterThan(
                richest,
            )
        })
    })

    describe('selection preview', () => {
        it('should return one seat per requested guardian', async () => {
            const simulator = new FiSimulator()

            const result = await preview(simulator, 13)

            expect(result.type).toBe('preview')
            if (result.type !== 'preview') return
            expect(result.preview.seats).toHaveLength(13)
            expect(result.preview.selected).toBe(13)
        })

        it('should total exactly the sum of the per-seat prices', async () => {
            const simulator = new FiSimulator()

            const result = await preview(simulator, 7)

            if (result.type !== 'preview') throw new Error('expected preview')
            const summed = result.preview.seats.reduce(
                (total, seat) => total + Number(seat.advertisedPriceMsats),
                0,
            )
            expect(Number(result.preview.totalAdvertisedMsats)).toBe(summed)
            // the design references quote 2,100 sats per seat
            expect(summed).toBe(7 * 2_100_000)
        })

        it('should vary per-seat prices so the details list is not uniform', async () => {
            const simulator = new FiSimulator()

            const result = await preview(simulator, 10)

            if (result.type !== 'preview') throw new Error('expected preview')
            const prices = new Set(
                result.preview.seats.map(seat => seat.advertisedPriceMsats),
            )
            expect(prices.size).toBeGreaterThan(1)
        })

        it('should expire in unix seconds, not milliseconds', async () => {
            const simulator = new FiSimulator()

            const result = await preview(simulator)

            if (result.type !== 'preview') throw new Error('expected preview')
            const expectedExpiry = Math.floor(Date.now() / 1000) + 120
            expect(result.preview.validUntil).toBeCloseTo(expectedExpiry, -1)
        })

        it('should reject a size no verified guardian set can serve', async () => {
            const simulator = new FiSimulator()
            simulator.setFleet({ eligible: 8, seen: 11 })

            const result = await preview(simulator, 19)

            expect(result.type).toBe('error')
            if (result.type !== 'error') return
            expect(result.error.code).toBe('selection')
            expect(result.error.detail).toEqual({
                type: 'insufficientFmanSeats',
                requested: 19,
                selected: 8,
                seen: 11,
                eligible: 8,
            })
        })
    })

    describe('pay and create', () => {
        it('should start a formation and report success', async () => {
            const simulator = new FiSimulator()
            const result = await payWithFreshPreview(simulator)

            expect(result).toEqual({ type: 'success' })
            const current = await status(simulator)
            expect(current.type).toBe('ready')
            if (current.type !== 'ready') return
            expect(current.status.type).toBe('formation')
        })

        it('should reject an unknown preview id as needing reauthorization', async () => {
            const simulator = new FiSimulator()

            const result = (await simulator.handle('fiClientPayAndCreate', {
                previewId: 'preview_does_not_exist',
                intent: intentFor(10),
                paymentFederationId: 'fed-bitcoin-builders',
                maxTotalMsats: '21000000',
            })) as RpcFiOperationResult

            expect(result.type).toBe('error')
            if (result.type !== 'error') return
            expect(result.error.code).toBe('selectionReauthorizationRequired')
        })

        it('should reject a preview that expired while the user decided', async () => {
            const simulator = new FiSimulator()
            simulator.setPreviewValiditySecs(5)
            const previewResult = await preview(simulator)
            if (previewResult.type !== 'preview')
                throw new Error('expected preview')

            await jest.advanceTimersByTimeAsync(10_000)
            const result = (await simulator.handle('fiClientPayAndCreate', {
                previewId: previewResult.preview.previewId,
                intent: intentFor(10),
                paymentFederationId: 'fed-bitcoin-builders',
                maxTotalMsats: previewResult.preview.totalAdvertisedMsats,
            })) as RpcFiOperationResult

            if (result.type !== 'error') throw new Error('expected error')
            expect(result.error.detail).toEqual({
                type: 'selectionReauthorizationRequired',
                reason: 'previewExpired',
            })
        })

        it('should refuse to spend more than the approved cap', async () => {
            const simulator = new FiSimulator()
            const previewResult = await preview(simulator)
            if (previewResult.type !== 'preview')
                throw new Error('expected preview')

            const result = (await simulator.handle('fiClientPayAndCreate', {
                previewId: previewResult.preview.previewId,
                intent: intentFor(10),
                paymentFederationId: 'fed-bitcoin-builders',
                maxTotalMsats: '1',
            })) as RpcFiOperationResult

            expect(result.type).toBe('error')
            if (result.type !== 'error') return
            expect(result.error.code).toBe('selectionReauthorizationRequired')
        })
    })

    describe('formation timeline', () => {
        it('should continue after resume clears the error', async () => {
            const simulator = new FiSimulator()
            simulator.setStatus(
                formationStatus(
                    withUnsynced(
                        withError(
                            formationAt({ formationId: 'f1' }, 'dkgUnderway'),
                            'fleetManager',
                        ),
                    ),
                ),
            )

            const resumed = (await simulator.handle(
                'fiClientResume',
                {},
            )) as RpcFiOperationResult

            expect(resumed).toEqual({ type: 'success' })
            const formation = await currentFormation(simulator)
            expect(formation.lastError).toBeNull()
            expect(formation.freshness).toBe('fresh')
            expect(jest.getTimerCount()).toBe(0)
        })

        it('should reject a stale authorization id', async () => {
            const simulator = new FiSimulator()
            simulator.setStatus(formationStatus(parkedAuthorization()))

            const result = (await simulator.handle(
                'fiClientAuthorizeReplacementPayments',
                { authorizationId: 'auth_stale' },
            )) as RpcFiOperationResult

            expect(result.type).toBe('error')
            if (result.type !== 'error') return
            expect(result.error.code).toBe('invalidIntent')
        })

        it('should clear the parked authorization once the real authorization lands', async () => {
            const simulator = new FiSimulator()
            simulator.setStatus(
                formationStatus({
                    ...parkedAuthorization(),
                    paymentOutputsStarted: false,
                }),
            )

            const result = (await simulator.handle(
                'fiClientAuthorizeReplacementPayments',
                { authorizationId: 'auth_1' },
            )) as RpcFiOperationResult

            expect(result).toEqual({ type: 'success' })
            const formation = await currentFormation(simulator)
            expect(formation.actionRequired).toBeNull()
            expect(formation.paymentOutputsStarted).toBe(true)
            expect(jest.getTimerCount()).toBe(0)
        })
    })

    describe('guardian fee', () => {
        it('should refuse a fee before the federation is formed', async () => {
            const simulator = new FiSimulator()
            await payWithFreshPreview(simulator)

            const result = (await simulator.handle('fiClientSetGuardianFee', {
                guardianFeePpm: 5_000,
            })) as RpcFiOperationResult

            expect(result.type).toBe('error')
            if (result.type !== 'error') return
            expect(result.error.code).toBe('noActiveFormation')
        })

        it('should refuse a fee above the 210,000 ppm ceiling', async () => {
            const simulator = new FiSimulator()
            await formInstantly(simulator)

            const result = (await simulator.handle('fiClientSetGuardianFee', {
                guardianFeePpm: 210_001,
            })) as RpcFiOperationResult

            expect(result.type).toBe('error')
            if (result.type !== 'error') return
            expect(result.error.code).toBe('invalidIntent')
        })

        it('should record the fee once the federation is formed', async () => {
            const simulator = new FiSimulator()
            await formInstantly(simulator)

            const result = (await simulator.handle('fiClientSetGuardianFee', {
                guardianFeePpm: 5_000,
            })) as RpcFiOperationResult

            expect(result).toEqual({ type: 'success' })
            expect(
                (await currentFormation(simulator)).intent.guardianFeePpm,
            ).toBe(5_000)
        })
    })

    describe('abandon', () => {
        it('should refuse once the payment outputs have started', async () => {
            const simulator = new FiSimulator()
            simulator.setStatus(
                formationStatus(
                    formationAt({ formationId: 'f1' }, 'acquiringSeats'),
                ),
            )

            const result = (await simulator.handle(
                'fiClientAbandon',
                {},
            )) as RpcFiOperationResult

            expect(result.type).toBe('error')
            if (result.type !== 'error') return
            expect(result.error.code).toBe('abandonUnavailable')
        })

        it('should return the client to idle while still preparing', async () => {
            const simulator = new FiSimulator()
            await payWithFreshPreview(simulator)

            const result = (await simulator.handle(
                'fiClientAbandon',
                {},
            )) as RpcFiOperationResult

            expect(result).toEqual({ type: 'success' })
            const current = await status(simulator)
            if (current.type !== 'ready') throw new Error('expected ready')
            expect(current.status).toEqual({ type: 'idle' })
        })
    })

    describe('subscription', () => {
        it('should push the current snapshot on subscribe', async () => {
            const simulator = new FiSimulator()
            const emit = jest.fn()
            simulator.attach(emit)

            await simulator.handle('fiClientSubscribe', { streamId: 1 })
            await jest.advanceTimersByTimeAsync(0)

            expect(emit).toHaveBeenCalledWith({
                stream_id: 1,
                sequence: 0,
                data: { type: 'ready', status: { type: 'idle' } },
            })
        })

        it('should increment the sequence on every update', async () => {
            const simulator = new FiSimulator()
            const emit = jest.fn()
            simulator.attach(emit)
            await simulator.handle('fiClientSubscribe', { streamId: 1 })
            await jest.advanceTimersByTimeAsync(0)

            await payWithFreshPreview(simulator)

            const sequences = emit.mock.calls.map(([update]) => update.sequence)
            expect(sequences).toEqual(
                Array.from({ length: sequences.length }, (_, i) => i),
            )
            expect(sequences.length).toBeGreaterThan(1)
        })

        it('should stop pushing after the stream is cancelled', async () => {
            const simulator = new FiSimulator()
            const emit = jest.fn()
            simulator.attach(emit)
            await simulator.handle('fiClientSubscribe', { streamId: 1 })
            await jest.advanceTimersByTimeAsync(0)
            await simulator.handle('streamCancel', { streamId: 1 })
            emit.mockClear()

            await payWithFreshPreview(simulator)

            expect(emit).not.toHaveBeenCalled()
        })
    })

    describe('unsimulated methods', () => {
        it('should report capabilityUnavailable rather than throwing', async () => {
            const simulator = new FiSimulator()

            const result = (await simulator.handle(
                'fiClientRegisterPushInstallation',
                {},
            )) as RpcFiOperationResult

            expect(result.type).toBe('error')
            if (result.type !== 'error') return
            expect(result.error.code).toBe('capabilityUnavailable')
        })
    })

    describe('liquidity', () => {
        const discover = (simulator: FiSimulator, network = 'signet') =>
            simulator.handle('fiClientLiquidityDiscover', {
                network,
            }) as Promise<RpcFiLiquidityDiscoveryResult>

        const start = (simulator: FiSimulator) =>
            simulator.handle(
                'fiClientLiquidityStart',
                {},
            ) as Promise<RpcFiLiquidityOperationResult>

        const readStatus = (simulator: FiSimulator) =>
            simulator.handle(
                'fiClientLiquidityStatus',
                {},
            ) as Promise<RpcFiLiquidityOperationResult>

        it('should admit one provider on the federation network', async () => {
            const simulator = new FiSimulator()

            const result = await discover(simulator)

            expect(result.type).toBe('discovery')
            if (result.type !== 'discovery') return
            expect(result.providers).toHaveLength(1)
            expect(result.providers[0]?.supportedNetworks).toContain('signet')
        })

        // a provider on another network is not an error: discovery worked and
        // admitted nobody who can serve this federation
        it('should admit nobody when the provider serves another network', async () => {
            const simulator = new FiSimulator()
            simulator.setLiquidityNetwork('bitcoin')

            const result = await discover(simulator)

            expect(result.type).toBe('discovery')
            if (result.type !== 'discovery') return
            expect(result.providers).toHaveLength(0)
            expect(result.rejected).toHaveLength(1)
        })

        it('should verify the gateway view only after two status reads', async () => {
            const simulator = new FiSimulator()

            const started = await start(simulator)
            expect(started.type).toBe('operation')
            if (started.type !== 'operation') return
            expect(started.operation.gatewayViewVerified).toBe(false)

            const first = await readStatus(simulator)
            expect(
                first.type === 'operation' &&
                    first.operation.gatewayViewVerified,
            ).toBe(false)
            const second = await readStatus(simulator)
            expect(
                second.type === 'operation' &&
                    second.operation.gatewayViewVerified,
            ).toBe(true)
        })

        // at most one live operation per federation
        it('should adopt the running operation instead of starting a second', async () => {
            const simulator = new FiSimulator()
            simulator.startLiquidity({ verified: false })

            const current = (await simulator.handle(
                'fiClientLiquidityCurrent',
                {},
            )) as RpcFiCurrentLiquidityOperationResult
            expect(current.type).toBe('current')
            if (current.type !== 'current') return
            expect(current.operation).not.toBeNull()

            const started = await start(simulator)
            expect(started.type).toBe('operation')
            if (started.type !== 'operation') return
            expect(started.operation.operationId).toBe(
                current.operation?.operationId,
            )
        })

        it('should seed an already attached provider as verified', async () => {
            const simulator = new FiSimulator()
            simulator.setStatus(
                formationStatus(formationAt({ formationId: 'f1' }, 'formed')),
            )
            simulator.startLiquidity({ verified: true })

            const current = (await simulator.handle(
                'fiClientLiquidityCurrent',
                {},
            )) as RpcFiCurrentLiquidityOperationResult

            expect(current.type).toBe('current')
            if (current.type !== 'current') return
            expect(current.operation?.gatewayViewVerified).toBe(true)
        })
    })

    describe('happy path, end to end', () => {
        const GLOBAL = 'mock-payer-global-bitcoin'
        const VICTORIA = 'mock-payer-victoria'
        const SETUP_MSATS = 21_000_000

        const payerIds = async (simulator: FiSimulator) => {
            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult
            if (result.type !== 'payers') throw new Error('expected payers')
            return result.payers
        }

        /** A simulator wired to a spy, so announced events can be asserted. */
        const attached = () => {
            const simulator = new FiSimulator()
            const emitEvent = jest.fn()
            simulator.attach(jest.fn(), emitEvent)
            return { simulator, emitEvent }
        }

        const formedInvite = async (simulator: FiSimulator) => {
            await formInstantly(simulator)
            const formation = await currentFormation(simulator)
            if (!formation.inviteCode) throw new Error('expected an invite')
            simulator.formWalletService('ready')
            return formation.inviteCode
        }

        it('should name a seeded payer from its story, and prefer a name given by hand', () => {
            const simulator = new FiSimulator()
            simulator.clearMockPayers()
            simulator.addMockPayer(GLOBAL, 1)
            simulator.addMockPayer(VICTORIA, 1, 'Renamed')

            expect(simulator.listMockFederations().map(f => f.name)).toEqual([
                'Global Bitcoin Federation',
                'Renamed',
            ])
        })

        it('should announce each seeded payer as a federation event, so redux holds it', () => {
            const { simulator, emitEvent } = attached()
            simulator.setPayerSource('mock')

            const announced = emitEvent.mock.calls
                .filter(([event]) => event === 'federation')
                .map(([, federation]) => federation.id)
            expect(announced).toEqual(MOCK_PAYER_FEDERATION_IDS)
        })

        it('should move a top-up between two seeded wallets and report it as a claimed receive', async () => {
            const { simulator, emitEvent } = attached()
            const global = MOCK_PAYER_FEDERATIONS.find(m => m.id === GLOBAL)
            if (!global) throw new Error('expected the global payer')

            const invoice = (await simulator.handle('generateInvoice', {
                federationId: VICTORIA,
                amount: SETUP_MSATS,
            })) as string
            expect(simulator.handles('payInvoice', { invoice })).toBe(true)

            const paying = simulator.handle('payInvoice', {
                invoice,
                federationId: GLOBAL,
            })
            await jest.advanceTimersByTimeAsync(1_000)
            await paying

            const payers = await payerIds(simulator)
            expect(
                payers.find(p => p.federationId === VICTORIA)?.balanceMsats,
            ).toBe(String(SETUP_MSATS))
            expect(
                payers.find(p => p.federationId === GLOBAL)?.balanceMsats,
            ).toBe(String(global.balanceSats * 1_000 - SETUP_MSATS))
            expect(emitEvent).toHaveBeenCalledWith(
                'balance',
                expect.objectContaining({ federationId: VICTORIA }),
            )
            expect(emitEvent).toHaveBeenCalledWith(
                'transaction',
                expect.objectContaining({
                    federationId: VICTORIA,
                    transaction: expect.objectContaining({
                        kind: 'lnReceive',
                        ln_invoice: invoice,
                        state: { type: 'claimed' },
                    }),
                }),
            )
        })

        it('should refund a spent payer when the mock source is chosen again', async () => {
            const { simulator, emitEvent } = attached()
            const invoice = (await simulator.handle('generateInvoice', {
                federationId: VICTORIA,
                amount: SETUP_MSATS,
            })) as string
            const paying = simulator.handle('payInvoice', {
                invoice,
                federationId: GLOBAL,
            })
            await jest.advanceTimersByTimeAsync(1_000)
            await paying

            emitEvent.mockClear()
            simulator.setPayerSource('mock')

            const payers = await payerIds(simulator)
            expect(
                payers.find(p => p.federationId === VICTORIA)?.balanceMsats,
            ).toBe('0')
            expect(simulator.listMockFederations()).toHaveLength(
                MOCK_PAYER_FEDERATIONS.length,
            )
            expect(emitEvent).toHaveBeenCalledWith(
                'federation',
                expect.objectContaining({ id: VICTORIA, balance: 0 }),
            )
        })

        it('should report the restored balance when a payer is added by hand twice', () => {
            const { simulator, emitEvent } = attached()
            simulator.addMockPayer(VICTORIA, 0)

            simulator.addMockPayer(VICTORIA, 7)

            expect(emitEvent).toHaveBeenCalledWith('balance', {
                federationId: VICTORIA,
                balance: 7_000,
            })
        })

        it('should stand up the formed wallet service on signet and announce it', async () => {
            const { simulator, emitEvent } = attached()

            const inviteCode = await formedInvite(simulator)

            expect(emitEvent).toHaveBeenCalledWith(
                'federation',
                expect.objectContaining({
                    name: 'Test Service',
                    network: 'signet',
                    inviteCode,
                }),
            )
            const announced = emitEvent.mock.calls.find(
                ([event, federation]) =>
                    event === 'federation' &&
                    federation.inviteCode === inviteCode,
            )?.[1]
            expect(simulator.listMockFederations().map(f => f.id)).toContain(
                announced.id,
            )
            expect(simulator.handles('parseInviteCode', { inviteCode })).toBe(
                true,
            )
            expect(
                simulator.handles('parseInviteCode', {
                    inviteCode: 'fed1other',
                }),
            ).toBe(false)
            const parsed = (await simulator.handle('parseInviteCode', {
                inviteCode,
            })) as RpcParseInviteCodeResult
            expect(parsed.federationId).toBe(announced.id)
            expect(simulator.handles('federationPreview', { inviteCode })).toBe(
                true,
            )
            const previewed = (await simulator.handle('federationPreview', {
                inviteCode,
            })) as RpcFederationPreview
            expect(previewed).toMatchObject({
                id: announced.id,
                name: 'Test Service',
                inviteCode,
            })
            expect(
                simulator.handles('getGuardianStatus', {
                    federationId: announced.id,
                }),
            ).toBe(true)
            const statuses = (await simulator.handle('getGuardianStatus', {
                federationId: announced.id,
            })) as GuardianStatus[]
            const { seats } = await currentFormation(simulator)
            expect(statuses).toHaveLength(10)
            expect(statuses[0]).toEqual({
                online: { guardian: seats[0]?.fmanName, latency_ms: 1 },
            })
        })

        it('should publish the applied guardian fee in the preview once it is set', async () => {
            const { simulator } = attached()
            const inviteCode = await formedInvite(simulator)

            const before = (await simulator.handle('federationPreview', {
                inviteCode,
            })) as RpcFederationPreview
            expect(before.meta['fedi:guardian_fee_send_ppm']).toBeUndefined()

            await simulator.handle('fiClientSetGuardianFee', {
                guardianFeePpm: 5_000,
            })

            const after = (await simulator.handle('federationPreview', {
                inviteCode,
            })) as RpcFederationPreview
            expect(after.meta['fedi:guardian_fee_send_ppm']).toBe('5000')
        })

        it('should attach the Lightning provider once formed, with no extra seeding', async () => {
            const { simulator } = attached()
            await formedInvite(simulator)

            const discovery = (await simulator.handle(
                'fiClientLiquidityDiscover',
                { network: 'signet' },
            )) as RpcFiLiquidityDiscoveryResult
            expect(discovery.type).toBe('discovery')
            if (discovery.type !== 'discovery') return
            expect(discovery.providers).toHaveLength(1)

            const started = (await simulator.handle(
                'fiClientLiquidityStart',
                {},
            )) as RpcFiLiquidityOperationResult
            expect(started.type).toBe('operation')

            await simulator.handle('fiClientLiquidityStatus', {})
            const verified = (await simulator.handle(
                'fiClientLiquidityStatus',
                {},
            )) as RpcFiLiquidityOperationResult
            expect(verified.type).toBe('operation')
            if (verified.type !== 'operation') return
            expect(verified.operation.gatewayViewVerified).toBe(true)
        })

        it('should clear every seeded wallet and the formation', async () => {
            const { simulator } = attached()
            const inviteCode = await formedInvite(simulator)

            simulator.clearSimulatedState()

            expect(simulator.listMockFederations()).toEqual([])
            expect(await status(simulator)).toEqual({
                type: 'ready',
                status: { type: 'idle' },
            })
            expect(simulator.handles('parseInviteCode', { inviteCode })).toBe(
                false,
            )
            expect(await payerIds(simulator)).toEqual([])
        })
    })

    // The bridge runs one auto-join for both paths: `formed_federation_invite`
    // yields the invite for a `formation` status as well as a `restored` one.
    // Without it the created path reported no join at all, so the dashboard's
    // failed-join handling was unreachable in dev.
    describe('created federation auto-join', () => {
        // `fi_client_status` re-delivers the retained report, because a status
        // read can happen after the event was delivered — a fresh subscribe or
        // a foreground refresh. Without it the app has no way back to a join
        // state it was not listening for.
        it('should re-emit the last join state on a status read', async () => {
            const { simulator, joinStates } = joinReports()
            formAndJoin(simulator, 'f1', 'ready')
            joinStates.length = 0

            await simulator.handle('fiClientStatus', {})

            expect(joinStates).toEqual([{ type: 'ready' }])
        })

        it('should re-emit a failed join on a status read', async () => {
            const { simulator, joinStates } = joinReports()
            formAndJoin(simulator, 'f1', 'failed')
            joinStates.length = 0

            await simulator.handle('fiClientStatus', {})

            expect(joinStates).toEqual([
                {
                    type: 'failed',
                    message: 'simulated: federation join failed',
                },
            ])
        })

        it('should re-emit nothing when no join has been reported', async () => {
            const { simulator, joinStates } = joinReports()

            await simulator.handle('fiClientStatus', {})

            expect(joinStates).toEqual([])
        })

        // `Bridge::leave_federation` suppresses the auto-join and clears the
        // retained report under one lock, so a report that lands afterwards
        // says nothing: a federation left on purpose is silence, never a
        // `failed` the app would show as a broken recovery.
        it('should stay silent when the federation is left mid-recovery', async () => {
            const { simulator, joinStates } = joinReports()
            formAndJoin(simulator, 'f1', 'joining')
            simulator.formWalletService('recovering')
            expect(joinStates).toEqual([
                { type: 'joining' },
                { type: 'recovering' },
            ])
            const { federationId } = (await simulator.handle(
                'parseInviteCode',
                {},
            )) as RpcParseInviteCodeResult
            joinStates.length = 0

            expect(simulator.handles('leaveFederation', { federationId })).toBe(
                true,
            )
            await simulator.handle('leaveFederation', { federationId })
            simulator.formWalletService('ready')

            expect(joinStates).toEqual([])
            expect(walletServiceListing(simulator)).toBeUndefined()
        })

        it('should forget the retained join state of a federation that was left', async () => {
            const { simulator, joinStates } = joinReports()
            formAndJoin(simulator, 'f1', 'ready')
            const { federationId } = (await simulator.handle(
                'parseInviteCode',
                {},
            )) as RpcParseInviteCodeResult

            await simulator.handle('leaveFederation', { federationId })
            joinStates.length = 0
            await simulator.handle('fiClientStatus', {})

            expect(joinStates).toEqual([])
        })

        // The bridge keys its suppression marker by federation id, so a leave
        // silences only that federation. A later formation has a new id and
        // its auto-join reports as normal.
        it('should report the join of a federation formed after another was left', async () => {
            const { simulator, joinStates } = joinReports()
            formAndJoin(simulator, 'f1', 'ready')
            const { federationId: leftId } = (await simulator.handle(
                'parseInviteCode',
                {},
            )) as RpcParseInviteCodeResult
            await simulator.handle('leaveFederation', {
                federationId: leftId,
            })
            joinStates.length = 0

            formAndJoin(simulator, 'f2', 'joining')
            simulator.formWalletService('ready')

            const listing = walletServiceListing(simulator)
            expect(listing).toBeDefined()
            expect(listing?.id).not.toBe(leftId)
            expect(joinStates).toEqual([{ type: 'joining' }, { type: 'ready' }])
        })
    })

    describe('scripting host', () => {
        it('should publish a set status on the open stream with the next sequence', async () => {
            const simulator = new FiSimulator()
            const updates: Array<{
                stream_id: number
                sequence: number
                data: RpcFiClientStatus
            }> = []
            simulator.attach(update => updates.push(update))
            await simulator.handle('fiClientSubscribe', { streamId: 3 })
            await jest.advanceTimersByTimeAsync(0)
            const before = updates.length

            simulator.setStatus({ type: 'idle' })

            expect(updates).toHaveLength(before + 1)
            expect(updates.at(-1)?.sequence).toBe(before)
            expect(updates.at(-1)?.data).toEqual({
                type: 'ready',
                status: { type: 'idle' },
            })
        })

        it('should answer the next call of a method with the one-shot reply, then fall back', async () => {
            const simulator = new FiSimulator()
            simulator.setReply('fiClientEligiblePayers', {
                type: 'payers',
                payers: [],
            })

            const first = await simulator.handle('fiClientEligiblePayers', {})
            const second = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(first).toEqual({ type: 'payers', payers: [] })
            expect(second.type).toBe('payers')
            expect(second).not.toEqual({ type: 'payers', payers: [] })
        })

        it('should resolve onRpc with the payload of the next call before handling it', async () => {
            const simulator = new FiSimulator()
            const seen = simulator.onRpc('fiClientPayAndCreate')
            simulator.setReply('fiClientPayAndCreate', { type: 'success' })

            const result = await simulator.handle('fiClientPayAndCreate', {
                previewId: 'p1',
            })

            await expect(seen).resolves.toEqual({ previewId: 'p1' })
            expect(result).toEqual({ type: 'success' })
        })

        it('should form the wallet service so the app can list and parse it', async () => {
            const simulator = new FiSimulator()
            const events: Array<[string, unknown]> = []
            simulator.attach(
                () => {},
                (event, payload) => events.push([event, payload]),
            )
            simulator.setStatus({
                type: 'formation',
                formation: formationAt(
                    { formationId: 'formation_x' },
                    'formed',
                ),
            })

            simulator.formWalletService('ready')

            const listed = simulator.listMockFederations()
            expect(listed.map(f => f.id)).toContain(
                'mock-wallet-service-formation_x',
            )
            expect(events.map(([e]) => e)).toEqual([
                'federation',
                'fiFederationJoin',
            ])
            expect(events[1][1]).toEqual({
                federationId: 'mock-wallet-service-formation_x',
                state: { type: 'ready' },
            })
            expect(
                simulator.handles('parseInviteCode', {
                    inviteCode: `fed1${'sim'.padEnd(40, '0')}formation_x`,
                }),
            ).toBe(true)
        })

        it('should report a failed join without scheduling anything', () => {
            const simulator = new FiSimulator()
            const events: Array<[string, unknown]> = []
            simulator.attach(
                () => {},
                (event, payload) => events.push([event, payload]),
            )
            simulator.setStatus({
                type: 'formation',
                formation: formationAt(
                    { formationId: 'formation_y' },
                    'formed',
                ),
            })

            simulator.formWalletService('failed')

            expect(events.map(([e]) => e)).toEqual(['fiFederationJoin'])
            expect(
                (events[0][1] as { state: { type: string } }).state.type,
            ).toBe('failed')
            // the default payer source seeds its own mock wallets, so a failed
            // join is proven by the wallet service's absence, not an empty list
            expect(
                simulator.listMockFederations().map(f => f.id),
            ).not.toContain('mock-wallet-service-formation_y')
            expect(jest.getTimerCount()).toBe(0)
        })

        it('should clear one-shot replies and waiters on reset', async () => {
            const simulator = new FiSimulator()
            simulator.setReply('fiClientEligiblePayers', {
                type: 'payers',
                payers: [],
            })
            const waiter = simulator.onRpc('fiClientStatus')

            simulator.reset()
            await simulator.handle('fiClientStatus', {})
            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result).not.toEqual({ type: 'payers', payers: [] })
            await expect(
                Promise.race([waiter, Promise.resolve('unresolved')]),
            ).resolves.toBe('unresolved')
        })

        it('should restore the world defaults on reset', async () => {
            const simulator = new FiSimulator()
            simulator.setSeatPriceMsats(1_000_000_000_000)
            simulator.setJoinableWalletServices([])

            simulator.reset()
            const quote = await preview(simulator, 4)
            const joinable = (await simulator.handle(
                'fiClientSetupPaymentFederations',
                {},
            )) as RpcFiSetupPaymentFederationsResult

            if (quote.type !== 'preview') throw new Error('expected preview')
            expect(Number(quote.preview.totalAdvertisedMsats)).toBe(
                4 * 2_100_000,
            )
            if (joinable.type !== 'federations')
                throw new Error('expected federations')
            expect(joinable.federations.some(f => !f.joined)).toBe(true)
        })

        it('should hand out formation ids from the same counter as payAndCreate', () => {
            const simulator = new FiSimulator()

            expect(simulator.nextFormationId()).toBe('formation_1')
            expect(simulator.nextFormationId()).toBe('formation_2')
        })

        it('should answer every call of a stubbed method until reset', async () => {
            const simulator = new FiSimulator()
            simulator.setStub('fiClientStatus', () => 'stubbed')

            expect(await simulator.handle('fiClientStatus', {})).toBe('stubbed')
            expect(await simulator.handle('fiClientStatus', {})).toBe('stubbed')

            simulator.reset()
            expect(
                (
                    (await simulator.handle(
                        'fiClientStatus',
                        {},
                    )) as RpcFiClientStatus
                ).type,
            ).toBe('ready')
        })

        it('should let a stub delegate to the default answer', async () => {
            const simulator = new FiSimulator()
            simulator.setStub('fiClientEligiblePayers', payload =>
                simulator.defaultHandle('fiClientEligiblePayers', payload),
            )

            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result.type).toBe('payers')
        })

        it('should prefer a one-shot reply over a stub, once', async () => {
            const simulator = new FiSimulator()
            simulator.setStub('fiClientStatus', () => 'stubbed')
            simulator.setReply('fiClientStatus', 'once')

            expect(await simulator.handle('fiClientStatus', {})).toBe('once')
            expect(await simulator.handle('fiClientStatus', {})).toBe('stubbed')
        })

        it('should price seats from the world seat price', async () => {
            const simulator = new FiSimulator()
            simulator.setSeatPriceMsats(1_000_000_000_000)

            const result = await preview(simulator, 2)

            if (result.type !== 'preview') throw new Error('expected a preview')
            expect(Number(result.preview.totalAdvertisedMsats)).toBe(
                2_000_000_000_000,
            )
        })

        it('should refuse a size above the world fleet and report the fleet counts', async () => {
            const simulator = new FiSimulator()
            simulator.setFleet({ eligible: 8, seen: 11 })

            const result = await preview(simulator, 10)

            expect(result).toMatchObject({
                type: 'error',
                error: {
                    detail: {
                        type: 'insufficientFmanSeats',
                        seen: 11,
                        eligible: 8,
                    },
                },
            })
        })

        it('should offer no joinable services once the world has none', async () => {
            const simulator = new FiSimulator()
            simulator.setJoinableWalletServices([])

            const result = (await simulator.handle(
                'fiClientSetupPaymentFederations',
                {},
            )) as RpcFiSetupPaymentFederationsResult

            if (result.type !== 'federations')
                throw new Error('expected federations')
            expect(result.federations.every(f => f.joined)).toBe(true)
        })

        it('should expire a preview after the world validity', async () => {
            const simulator = new FiSimulator()
            simulator.setPreviewValiditySecs(5)

            const result = await preview(simulator)

            if (result.type !== 'preview') throw new Error('expected a preview')
            expect(
                result.preview.validUntil - Math.floor(Date.now() / 1000),
            ).toBe(5)
        })

        it('should put the provider on the world liquidity network', async () => {
            const simulator = new FiSimulator()
            simulator.setLiquidityNetwork('bitcoin')

            const result = (await simulator.handle(
                'fiClientLiquidityDiscover',
                {
                    network: 'signet',
                },
            )) as RpcFiLiquidityDiscoveryResult

            expect(result).toMatchObject({
                type: 'discovery',
                providers: [],
                rejected: [{ code: 'networkUnsupported' }],
            })
        })

        it('should start a liquidity operation from the world, verified or not', async () => {
            const simulator = new FiSimulator()
            simulator.setStatus({
                type: 'formation',
                formation: formationAt({ formationId: 'f1' }, 'formed'),
            })

            simulator.startLiquidity({ verified: true })

            expect(simulator.currentLiquidityOperation()).toMatchObject({
                formationId: 'f1',
                gatewayViewVerified: true,
            })
            const current = (await simulator.handle(
                'fiClientLiquidityCurrent',
                {},
            )) as RpcFiCurrentLiquidityOperationResult
            expect(
                current.type === 'current' && current.operation?.operationId,
            ).toBe(simulator.currentLiquidityOperation()?.operationId)
        })

        it('should list the eligible payer ids for the current source', () => {
            const simulator = new FiSimulator()
            expect(simulator.eligiblePayerIds()).toEqual(
                MOCK_PAYER_FEDERATION_IDS,
            )
            simulator.setPayerSource('none')
            expect(simulator.eligiblePayerIds()).toEqual([])
        })

        it('should report a recovering join, listing the federation as recovering', () => {
            const simulator = new FiSimulator()
            const emitEvent = jest.fn()
            simulator.attach(jest.fn(), emitEvent)
            simulator.setStatus({
                type: 'formation',
                formation: formationAt({ formationId: 'f1' }, 'formed'),
            })

            simulator.formWalletService('recovering')

            expect(emitEvent).toHaveBeenCalledWith(
                'federation',
                expect.objectContaining({
                    id: 'mock-wallet-service-f1',
                    recovering: true,
                }),
            )
            expect(emitEvent).toHaveBeenCalledWith('fiFederationJoin', {
                federationId: 'mock-wallet-service-f1',
                state: { type: 'recovering' },
            })
        })

        it('should form the wallet service from a restored status using its invite', () => {
            const simulator = new FiSimulator()
            const emitEvent = jest.fn()
            simulator.attach(jest.fn(), emitEvent)
            simulator.setStatus({
                type: 'restored',
                formation: {
                    snapshotGeneration: 1,
                    formationId: 'r1',
                    federationInvite: 'fed1restored',
                    federationName: 'Restored',
                    seats: [],
                    phase: 'formed',
                    freshness: 'fresh',
                    backupEligible: true,
                },
            })

            simulator.formWalletService('ready')

            expect(simulator.listMockFederations()).toContainEqual(
                expect.objectContaining({
                    id: 'mock-wallet-service-r1',
                    name: 'Restored',
                    inviteCode: 'fed1restored',
                }),
            )
        })

        it('should keep the same federation across join reports rather than re-forming it', () => {
            const simulator = new FiSimulator()
            const emitEvent = jest.fn()
            simulator.attach(jest.fn(), emitEvent)
            const formation = formationAt({ formationId: 'f1' }, 'formed')
            simulator.setStatus({ type: 'formation', formation })

            simulator.formWalletService('joining')
            // If the join report re-forms the federation, the second report
            // would pick up this renamed intent; keeping the original name
            // proves the federation created on `joining` was reused, not
            // rebuilt, when `ready` landed.
            formation.intent.federationName = 'Renamed mid-join'
            simulator.formWalletService('ready')

            expect(walletServiceListing(simulator)?.name).toBe(
                'My Wallet Service',
            )
            const joins = emitEvent.mock.calls
                .filter(([event]) => event === 'fiFederationJoin')
                .map(([, e]) => (e as FiFederationJoinEvent).state.type)
            expect(joins).toEqual(['joining', 'ready'])
        })

        it('should report only the failed join when asked for failed', () => {
            const simulator = new FiSimulator()
            const emitEvent = jest.fn()
            simulator.attach(jest.fn(), emitEvent)
            simulator.setStatus({
                type: 'formation',
                formation: formationAt({ formationId: 'f1' }, 'formed'),
            })

            simulator.formWalletService('failed')

            const joins = emitEvent.mock.calls
                .filter(([event]) => event === 'fiFederationJoin')
                .map(([, e]) => (e as FiFederationJoinEvent).state.type)
            expect(joins).toEqual(['failed'])
        })

        it('should forward emitEvent to the attached emitter', () => {
            const simulator = new FiSimulator()
            const events: Array<[string, unknown]> = []
            simulator.attach(
                () => {},
                (event, payload) => events.push([event, payload]),
            )

            simulator.emitEvent('balance', { federationId: 'f' })

            expect(events).toEqual([['balance', { federationId: 'f' }]])
        })
    })
})

/*** helpers ***/

/** A simulator whose `fiFederationJoin` reports are collected in order. */
function joinReports() {
    const simulator = new FiSimulator()
    const joinStates: RpcFiFederationJoinState[] = []
    const emitEvent = jest.fn((name: string, payload: unknown) => {
        if (name === 'fiFederationJoin')
            joinStates.push((payload as FiFederationJoinEvent).state)
    })
    simulator.attach(jest.fn(), emitEvent)
    return { simulator, joinStates, emitEvent }
}

/** Seat a formed formation and report the join state it reached. */
function formAndJoin(
    simulator: FiSimulator,
    formationId: string,
    join: FiWalletServiceJoin,
) {
    simulator.setStatus(formationStatus(formationAt({ formationId }, 'formed')))
    simulator.formWalletService(join)
}

/** The wallet service's own federation as the wallet list would carry it. */
const walletServiceListing = (simulator: FiSimulator) =>
    simulator
        .listMockFederations()
        .find(federation => federation.id.startsWith('mock-wallet-service-'))

const intentFor = (federationSize: number) => ({
    federationName: 'Test Service',
    federationSize,
    plan: 'infiniteBestEffort' as const,
})

async function payWithFreshPreview(
    simulator: FiSimulator,
    federationSize = 10,
): Promise<RpcFiOperationResult> {
    const previewResult = await preview(simulator, federationSize)
    if (previewResult.type !== 'preview') throw new Error('expected preview')
    return simulator.handle('fiClientPayAndCreate', {
        previewId: previewResult.preview.previewId,
        intent: intentFor(federationSize),
        paymentFederationId: 'fed-bitcoin-builders',
        maxTotalMsats: previewResult.preview.totalAdvertisedMsats,
    }) as Promise<RpcFiOperationResult>
}

/** Take the formation `payAndCreate` started to `formed`, as a script would. */
async function formInstantly(simulator: FiSimulator) {
    await payWithFreshPreview(simulator)
    const formation = await currentFormation(simulator)
    simulator.setStatus(
        formationStatus(
            formationAt(
                {
                    formationId: formation.formationId,
                    federationName:
                        formation.intent.federationName ?? undefined,
                    federationSize: formation.intent.federationSize,
                },
                'formed',
            ),
        ),
    )
}

/** A formation parked on an authorization the user has not answered. */
function parkedAuthorization() {
    return withAuthorization(
        formationAt({ formationId: 'f1' }, 'acquiringSeats'),
        {
            authorizationId: 'auth_1',
            amountSats: 6_300,
            payerFederationId: 'p',
        },
    )
}

async function currentFormation(simulator: FiSimulator) {
    const current = (await status(simulator)) as Extract<
        RpcFiClientStatus,
        { type: 'ready' }
    >
    const inner = current.status as Extract<RpcFiStatus, { type: 'formation' }>
    return inner.formation
}
