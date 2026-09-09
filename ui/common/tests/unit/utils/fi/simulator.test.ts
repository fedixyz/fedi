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
    RpcFiStatus,
    RpcParseInviteCodeResult,
} from '../../../../types/bindings'
import {
    MOCK_PAYER_FEDERATION_IDS,
    MOCK_PAYER_FEDERATIONS,
} from '../../../../utils/fi/mockPayerFederation'
import { FiScenarioName, fiScenarios } from '../../../../utils/fi/scenarios'
import { FiSimulator } from '../../../../utils/fi/simulator'

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

/** Resolve the pending preview latency without waiting in real time. */
const flushPreview = async <T>(pending: Promise<T>): Promise<T> => {
    await jest.advanceTimersByTimeAsync(5_000)
    return pending
}

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
        it('should report scenario payers with balances converted to msats', async () => {
            const simulator = new FiSimulator('happyPath')

            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result.type).toBe('payers')
            if (result.type !== 'payers') return
            expect(result.payers[0]).toEqual({
                federationId: 'fed-bitcoin-builders',
                balanceMsats: '312500000',
            })
        })

        it('should report an empty list for the no-payer scenario', async () => {
            const simulator = new FiSimulator('noEligiblePayers')

            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result).toEqual({ type: 'payers', payers: [] })
        })

        // the real bridge errors here rather than returning nothing, so the
        // two causes stay distinguishable end to end
        it('should error rather than empty for the failing-lookup scenario', async () => {
            const simulator = new FiSimulator('payerLookupFails')

            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result.type).toBe('error')
            expect(result).not.toEqual({ type: 'payers', payers: [] })
        })

        // a failing lookup must not take the price down with it
        it('should still price a selection when the payer lookup fails', async () => {
            const simulator = new FiSimulator('payerLookupFails')

            const result = await flushPreview(preview(simulator))

            expect(result.type).toBe('preview')
        })

        it('should admit a mock payer the app has never really joined', async () => {
            const simulator = new FiSimulator('happyPath')
            simulator.observeFederations(['real-fed'])
            simulator.addMockPayer('mock-payer-federation', 50_000)

            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result.type).toBe('payers')
            if (result.type !== 'payers') return
            expect(result.payers.map(p => p.federationId)).toEqual([
                'real-fed',
                'mock-payer-federation',
            ])
        })

        it('should keep the mock payer when the real federation list is replaced', async () => {
            const simulator = new FiSimulator('happyPath')
            simulator.addMockPayer('mock-payer-federation', 50_000)
            simulator.observeFederations(['real-fed'])

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

        it('should not list the mock payer twice once it is really joined', async () => {
            const simulator = new FiSimulator('happyPath')
            simulator.addMockPayer('mock-payer-federation', 50_000)
            simulator.observeFederations(['mock-payer-federation'])

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

        it('should drop the mock payer when it is cleared', async () => {
            const simulator = new FiSimulator('happyPath')
            simulator.observeFederations(['real-fed'])
            simulator.addMockPayer('mock-payer-federation', 50_000)

            simulator.clearMockPayers()
            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result.type).toBe('payers')
            if (result.type !== 'payers') return
            expect(result.payers.map(p => p.federationId)).toEqual(['real-fed'])
        })

        it('should report each mock payer at its own balance', async () => {
            const simulator = new FiSimulator('happyPath')
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
            const simulator = new FiSimulator('happyPath')
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
            const simulator = new FiSimulator('happyPath')
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

        it('should still report nothing for the no-payer scenario', async () => {
            const simulator = new FiSimulator('noEligiblePayers')
            simulator.addMockPayer('mock-payer-federation', 50_000)

            const result = (await simulator.handle(
                'fiClientEligiblePayers',
                {},
            )) as RpcFiEligiblePayersResult

            expect(result).toEqual({ type: 'payers', payers: [] })
        })
    })

    describe('selection preview', () => {
        it('should return one seat per requested guardian', async () => {
            const simulator = new FiSimulator()

            const result = await flushPreview(preview(simulator, 13))

            expect(result.type).toBe('preview')
            if (result.type !== 'preview') return
            expect(result.preview.seats).toHaveLength(13)
            expect(result.preview.selected).toBe(13)
        })

        it('should total exactly the sum of the per-seat prices', async () => {
            const simulator = new FiSimulator()

            const result = await flushPreview(preview(simulator, 7))

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

            const result = await flushPreview(preview(simulator, 10))

            if (result.type !== 'preview') throw new Error('expected preview')
            const prices = new Set(
                result.preview.seats.map(seat => seat.advertisedPriceMsats),
            )
            expect(prices.size).toBeGreaterThan(1)
        })

        it('should expire in unix seconds, not milliseconds', async () => {
            const simulator = new FiSimulator()

            const result = await flushPreview(preview(simulator))

            if (result.type !== 'preview') throw new Error('expected preview')
            const expectedExpiry = Math.floor(Date.now() / 1000) + 120
            expect(result.preview.validUntil).toBeCloseTo(expectedExpiry, -1)
        })

        it('should reject a size no verified guardian set can serve', async () => {
            const simulator = new FiSimulator('notEnoughGuardians')

            const result = await flushPreview(preview(simulator, 19))

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

        it('should serve the cold latency first and the warm latency after', async () => {
            const simulator = new FiSimulator('happyPath')

            const first = preview(simulator)
            await jest.advanceTimersByTimeAsync(500)
            expect(await settled(first)).toBe(false)
            await jest.advanceTimersByTimeAsync(600)
            expect(await settled(first)).toBe(true)

            const second = preview(simulator)
            await jest.advanceTimersByTimeAsync(450)
            expect(await settled(second)).toBe(true)
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
            const simulator = new FiSimulator('selectionExpiresFast')
            const previewResult = await flushPreview(preview(simulator))
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
            const previewResult = await flushPreview(preview(simulator))
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
        it('should reach formed and flip every milestone', async () => {
            const simulator = new FiSimulator()
            await payWithFreshPreview(simulator)

            await jest.advanceTimersByTimeAsync(30_000)

            const formation = await currentFormation(simulator)
            expect(formation.phase).toBe('formed')
            expect(formation.milestones).toEqual({
                ecashSent: true,
                guardiansConfirmed: true,
                walletServiceCreated: true,
            })
            expect(formation.inviteCode).toEqual(expect.any(String))
        })

        it('should stop and report the error code for a failing scenario', async () => {
            const simulator = new FiSimulator('formationFails')
            await payWithFreshPreview(simulator)

            await jest.advanceTimersByTimeAsync(30_000)

            const formation = await currentFormation(simulator)
            expect(formation.lastError).toBe('fleetManager')
            expect(formation.phase).not.toBe('formed')
        })

        it('should continue after resume clears the error', async () => {
            const simulator = new FiSimulator('formationFails')
            await payWithFreshPreview(simulator)
            await jest.advanceTimersByTimeAsync(30_000)

            // the failing phase is skipped only once, so resume walks on
            const resumed = (await simulator.handle(
                'fiClientResume',
                {},
            )) as RpcFiOperationResult
            expect(resumed).toEqual({ type: 'success' })
            const formation = await currentFormation(simulator)
            expect(formation.lastError).toBeNull()
        })

        it('should park an authorization request and wait for the user', async () => {
            const simulator = new FiSimulator('authorizePayments')
            await payWithFreshPreview(simulator)

            await jest.advanceTimersByTimeAsync(30_000)

            const formation = await currentFormation(simulator)
            expect(formation.actionRequired?.type).toBe('authorizePayments')
            expect(formation.phase).not.toBe('formed')
        })

        it('should reject a stale authorization id', async () => {
            const simulator = new FiSimulator('authorizePayments')
            await payWithFreshPreview(simulator)
            await jest.advanceTimersByTimeAsync(30_000)

            const result = (await simulator.handle(
                'fiClientAuthorizeReplacementPayments',
                { authorizationId: 'auth_stale' },
            )) as RpcFiOperationResult

            expect(result.type).toBe('error')
            if (result.type !== 'error') return
            expect(result.error.code).toBe('invalidIntent')
        })

        it('should resume the timeline once the real authorization lands', async () => {
            const simulator = new FiSimulator('authorizePayments')
            await payWithFreshPreview(simulator)
            await jest.advanceTimersByTimeAsync(30_000)
            const parked = await currentFormation(simulator)
            const authorizationId =
                parked.actionRequired?.type === 'authorizePayments'
                    ? parked.actionRequired.requirements.authorizationId
                    : ''

            const result = (await simulator.handle(
                'fiClientAuthorizeReplacementPayments',
                { authorizationId },
            )) as RpcFiOperationResult
            await jest.advanceTimersByTimeAsync(30_000)

            expect(result).toEqual({ type: 'success' })
            expect((await currentFormation(simulator)).phase).toBe('formed')
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
            await payWithFreshPreview(simulator)
            await jest.advanceTimersByTimeAsync(30_000)

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
            const simulator = new FiSimulator('lightningAttaches')

            const result = await discover(simulator)

            expect(result.type).toBe('discovery')
            if (result.type !== 'discovery') return
            expect(result.providers).toHaveLength(1)
            expect(result.providers[0]?.supportedNetworks).toContain('signet')
        })

        // a provider on another network is not an error: discovery worked and
        // admitted nobody who can serve this federation
        it('should admit nobody when the provider serves another network', async () => {
            const simulator = new FiSimulator('lightningWrongNetwork')

            const result = await discover(simulator)

            expect(result.type).toBe('discovery')
            if (result.type !== 'discovery') return
            expect(result.providers).toHaveLength(0)
            expect(result.rejected).toHaveLength(1)
        })

        it('should fail discovery with the scenario code', async () => {
            const simulator = new FiSimulator('lightningFailsRetryable')

            const result = await discover(simulator)

            expect(result.type).toBe('error')
            if (result.type !== 'error') return
            expect(result.error.code).toBe('busy')
        })

        it('should verify the gateway view only after the scenario says so', async () => {
            const simulator = new FiSimulator('lightningAttaches')

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

        it('should never verify when the scenario says it does not', async () => {
            const simulator = new FiSimulator('lightningNeverVerifies')

            await start(simulator)
            for (let read = 0; read < 5; read++) await readStatus(simulator)
            const result = await readStatus(simulator)

            expect(
                result.type === 'operation' &&
                    result.operation.gatewayViewVerified,
            ).toBe(false)
        })

        it('should report a rejected operation rather than an rpc error', async () => {
            const simulator = new FiSimulator('lightningRejected')

            await start(simulator)
            const result = await readStatus(simulator)

            // terminal for this intent, and never a formation failure — so it
            // arrives as a phase, not as an error envelope
            expect(result.type).toBe('operation')
            if (result.type !== 'operation') return
            expect(result.operation.phase).toBe('rejected')
        })

        // at most one live operation per federation
        it('should adopt the running operation instead of starting a second', async () => {
            const simulator = new FiSimulator('lightningAlreadyAttaching')

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
            const simulator = new FiSimulator('lightningAlreadyAttached')

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
        const attached = (scenario?: FiScenarioName) => {
            const simulator = new FiSimulator()
            const emitEvent = jest.fn()
            simulator.attach(jest.fn(), emitEvent)
            if (scenario) simulator.setScenario(scenario)
            return { simulator, emitEvent }
        }

        const formedInvite = async (simulator: FiSimulator) => {
            await payWithFreshPreview(simulator)
            await jest.advanceTimersByTimeAsync(30_000)
            const formation = await currentFormation(simulator)
            if (!formation.inviteCode) throw new Error('expected an invite')
            return formation.inviteCode
        }

        it('should seed the story 04 payers when the happy path is chosen, not at boot', async () => {
            const simulator = new FiSimulator('happyPath')
            simulator.observeFederations(['real-fed'])

            const atBoot = (await payerIds(simulator)).map(p => p.federationId)
            expect(atBoot).toEqual(['real-fed'])

            simulator.setScenario('happyPath')

            const chosen = (await payerIds(simulator)).map(p => p.federationId)
            expect(chosen).toEqual(['real-fed', ...MOCK_PAYER_FEDERATION_IDS])
        })

        it('should take the seeded payers away again when another scenario is chosen', async () => {
            const { simulator } = attached('happyPath')
            simulator.observeFederations(['real-fed'])

            simulator.setScenario('insufficientBalance')

            expect(simulator.listMockFederations()).toEqual([])
            expect(
                (await payerIds(simulator)).map(p => p.federationId),
            ).toEqual(['real-fed'])
        })

        it('should keep a payer added by hand across a scenario change', () => {
            const { simulator } = attached('happyPath')
            simulator.addMockPayer('hand-added', 5_000)

            simulator.setScenario('insufficientBalance')

            expect(simulator.listMockFederations().map(f => f.id)).toEqual([
                'hand-added',
            ])
        })

        it('should name a seeded payer from its story, and prefer a name given by hand', () => {
            const simulator = new FiSimulator()
            simulator.addMockPayer(GLOBAL, 1)
            simulator.addMockPayer(VICTORIA, 1, 'Renamed')

            expect(simulator.listMockFederations().map(f => f.name)).toEqual([
                'Global Bitcoin Federation',
                'Renamed',
            ])
        })

        it('should announce each seeded payer as a federation event, so redux holds it', () => {
            const { emitEvent } = attached('happyPath')

            const announced = emitEvent.mock.calls
                .filter(([event]) => event === 'federation')
                .map(([, federation]) => federation.id)
            expect(announced).toEqual(MOCK_PAYER_FEDERATION_IDS)
        })

        it('should move a top-up between two seeded wallets and report it as a claimed receive', async () => {
            const { simulator, emitEvent } = attached('happyPath')
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

        it('should refund a spent payer when the happy path is chosen again', async () => {
            const { simulator, emitEvent } = attached('happyPath')
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
            simulator.setScenario('happyPath')

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
            const { simulator, emitEvent } = attached('happyPath')

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
            const { simulator } = attached('happyPath')
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
            const { simulator } = attached('happyPath')
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
            const { simulator } = attached('happyPath')
            simulator.observeFederations(['real-fed'])
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
            expect(
                (await payerIds(simulator)).map(p => p.federationId),
            ).toEqual(['real-fed'])
        })
    })

    describe('restored backup scenarios', () => {
        it('restoredBackup announces the federation only after freshness', () => {
            const sim = new FiSimulator('restoredBackup')
            const events: string[] = []
            sim.attach(
                () => {},
                e => events.push(e),
            )

            jest.advanceTimersByTime(
                fiScenarios.restoredBackup.restoreReconcileMs,
            )
            expect(events).not.toContain('federation')

            const { restoreJoinMs } = fiScenarios.restoredBackup
            if (restoreJoinMs === null) {
                throw new Error('restoredBackup must define restoreJoinMs')
            }
            jest.advanceTimersByTime(restoreJoinMs)
            expect(events).toContain('federation')
        })

        it('restoredBackupJoinFails never announces the federation', () => {
            const sim = new FiSimulator('restoredBackupJoinFails')
            const events: string[] = []
            sim.attach(
                () => {},
                e => events.push(e),
            )

            jest.advanceTimersByTime(10 * 60_000)
            expect(events).not.toContain('federation')
        })

        // The wallet list is what the recovery checklist reads to decide the
        // `rejoining` and `restoringBalance` rows. A federation listed from the
        // first render skips both of them, so the very window these scenarios
        // exist to show never appears.
        it('restoredBackupSlowJoin lists the federation only once the join lands', () => {
            const sim = new FiSimulator('restoredBackupSlowJoin')
            sim.attach(
                () => {},
                () => {},
            )
            const { restoreReconcileMs, restoreJoinMs } =
                fiScenarios.restoredBackupSlowJoin
            if (restoreJoinMs === null) {
                throw new Error(
                    'restoredBackupSlowJoin must define restoreJoinMs',
                )
            }

            expect(sim.listMockFederations()).toEqual([])

            jest.advanceTimersByTime(restoreReconcileMs)
            expect(sim.listMockFederations()).toEqual([])
            // the invite still resolves to the id: the backup carries it, and
            // the real `parseInviteCode` answers offline too
            expect(
                sim.handles('parseInviteCode', {
                    inviteCode: `fed1${'sim'.padEnd(40, '0')}restored_formation`,
                }),
            ).toBe(true)

            jest.advanceTimersByTime(restoreJoinMs)
            expect(sim.listMockFederations()).toHaveLength(1)
        })

        it('restoredBackupJoinFails never lists the federation', () => {
            const sim = new FiSimulator('restoredBackupJoinFails')
            sim.attach(
                () => {},
                () => {},
            )

            jest.advanceTimersByTime(10 * 60_000)

            expect(sim.listMockFederations()).toEqual([])
        })

        it('restoredBackup reports the join as joining, then ready', () => {
            const sim = new FiSimulator('restoredBackup')
            const joinStates: RpcFiFederationJoinState[] = []
            sim.attach(
                () => {},
                (name, payload) => {
                    if (name === 'fiFederationJoin')
                        joinStates.push(
                            (payload as FiFederationJoinEvent).state,
                        )
                },
            )

            const { restoreReconcileMs, restoreJoinMs } =
                fiScenarios.restoredBackup
            if (restoreJoinMs === null) {
                throw new Error('restoredBackup must define restoreJoinMs')
            }

            jest.advanceTimersByTime(restoreReconcileMs)
            expect(joinStates).toEqual([{ type: 'joining' }])

            jest.advanceTimersByTime(restoreJoinMs)
            expect(joinStates).toEqual([{ type: 'joining' }, { type: 'ready' }])
        })

        it('restoredBackupJoinFails reports the join as failed and never ready', () => {
            const sim = new FiSimulator('restoredBackupJoinFails')
            const joinStates: RpcFiFederationJoinState[] = []
            sim.attach(
                () => {},
                (name, payload) => {
                    if (name === 'fiFederationJoin')
                        joinStates.push(
                            (payload as FiFederationJoinEvent).state,
                        )
                },
            )

            jest.advanceTimersByTime(10 * 60_000)

            expect(joinStates).toEqual([
                { type: 'joining' },
                {
                    type: 'failed',
                    message: 'simulated: federation join failed',
                },
            ])
        })

        it('restoredBackup publishes restored/unsynced on attach and restored/fresh once reconciled', async () => {
            const sim = new FiSimulator('restoredBackup')
            const statuses: RpcFiStatus[] = []
            sim.attach(update => {
                if (update.data.type === 'ready')
                    statuses.push(update.data.status)
            })

            await sim.handle('fiClientSubscribe', { streamId: 1 })
            await jest.advanceTimersByTimeAsync(0)

            expect(statuses[0]).toMatchObject({
                type: 'restored',
                formation: { freshness: 'unsynced' },
            })

            await jest.advanceTimersByTimeAsync(
                fiScenarios.restoredBackup.restoreReconcileMs,
            )

            expect(statuses.at(-1)).toMatchObject({
                type: 'restored',
                formation: { freshness: 'fresh' },
            })
        })
    })
})

/*** helpers ***/

const intentFor = (federationSize: number) => ({
    federationName: 'Test Service',
    federationSize,
    plan: 'infiniteBestEffort' as const,
})

async function payWithFreshPreview(
    simulator: FiSimulator,
    federationSize = 10,
): Promise<RpcFiOperationResult> {
    const previewResult = await flushPreview(preview(simulator, federationSize))
    if (previewResult.type !== 'preview') throw new Error('expected preview')
    return simulator.handle('fiClientPayAndCreate', {
        previewId: previewResult.preview.previewId,
        intent: intentFor(federationSize),
        paymentFederationId: 'fed-bitcoin-builders',
        maxTotalMsats: previewResult.preview.totalAdvertisedMsats,
    }) as Promise<RpcFiOperationResult>
}

async function formInstantly(simulator: FiSimulator) {
    await payWithFreshPreview(simulator)
    await jest.advanceTimersByTimeAsync(30_000)
}

async function currentFormation(simulator: FiSimulator) {
    const current = (await status(simulator)) as Extract<
        RpcFiClientStatus,
        { type: 'ready' }
    >
    const inner = current.status as Extract<RpcFiStatus, { type: 'formation' }>
    return inner.formation
}

/** Whether a promise has already resolved, without awaiting it forever. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
    const marker = Symbol('pending')
    const race = await Promise.race([promise, Promise.resolve(marker)])
    return race !== marker
}
