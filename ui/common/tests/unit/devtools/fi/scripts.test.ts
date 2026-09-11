import { FiPlayer } from '../../../../devtools/fi/player'
import { FI_SCREEN_GROUPS, findFiScreen } from '../../../../devtools/fi/screens'
import { FI_SCRIPT_GROUPS, findFiScript } from '../../../../devtools/fi/scripts'
import {
    formationCreatedJoinFails,
    formationHappyPath,
} from '../../../../devtools/fi/scripts/formation'
import {
    recoveryHappyPath,
    recoverySlowJoin,
} from '../../../../devtools/fi/scripts/recovery'
import { setupHappyPath } from '../../../../devtools/fi/scripts/setup'
import { FiSimulator } from '../../../../devtools/fi/simulator'
import { checkpointsOf } from '../../../../devtools/fi/steps'
import type {
    FiFederationJoinEvent,
    RpcFiClientStatus,
    RpcFiFormationSnapshot,
    RpcFiSelectionPreviewResult,
    RpcFiSetupPaymentFederationsResult,
} from '../../../../types/bindings'

const formationOf = (status: RpcFiClientStatus): RpcFiFormationSnapshot => {
    if (status.type !== 'ready' || status.status.type !== 'formation')
        throw new Error(`not a formation: ${JSON.stringify(status)}`)
    return status.status.formation
}

// optional `session` lets a test reuse one simulator/player pair across
// jumps, e.g. to prove the player's formation id keeps advancing rather than
// resetting with a fresh simulator every time
const jumpAndRead = async (
    screenId: string,
    session?: { simulator: FiSimulator; player: FiPlayer },
) => {
    const screen = findFiScreen(screenId)
    if (!screen) throw new Error(`no screen ${screenId}`)
    const simulator = session?.simulator ?? new FiSimulator()
    if (!session)
        simulator.attach(
            () => {},
            () => {},
        )
    const player = session?.player ?? new FiPlayer(simulator)
    const run = player.run(screen.script, { jumpTo: screen.checkpoint })
    await jest.advanceTimersByTimeAsync(0)
    const status = (await simulator.handle(
        'fiClientStatus',
        {},
    )) as RpcFiClientStatus
    player.cancel()
    await run
    return { screen, simulator, status }
}

describe('formation scripts', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('should give every script at least one checkpoint and unique checkpoint names', () => {
        for (const script of FI_SCRIPT_GROUPS.flatMap(g => g.scripts)) {
            const names = checkpointsOf(script)
            expect(names.length).toBeGreaterThan(0)
            expect(new Set(names).size).toBe(names.length)
        }
    })

    it('should point every screen at a checkpoint its script defines', () => {
        for (const group of FI_SCREEN_GROUPS) {
            for (const screen of group.screens) {
                expect(checkpointsOf(screen.script)).toContain(
                    screen.checkpoint,
                )
                expect(findFiScreen(screen.id)).toBe(screen)
            }
        }
    })

    it('should have unique screen ids across groups', () => {
        const ids = FI_SCREEN_GROUPS.flatMap(g => g.screens.map(s => s.id))
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('should land each formation phase screen on its phase', async () => {
        for (const phase of [
            'acquiringSeats',
            'dkgUnderway',
            'publishingSeatBindings',
        ] as const) {
            const { status } = await jumpAndRead(`formation.${phase}`)
            expect(formationOf(status).phase).toBe(phase)
            expect(formationOf(status).lastError).toBeNull()
        }
    })

    it('should land the retrying screen on a non-terminal error', async () => {
        const { status } = await jumpAndRead('formation.retrying')
        expect(formationOf(status).phase).toBe('dkgUnderway')
        expect(formationOf(status).lastError).toBe('fleetManager')
    })

    it('should land the terminal failure screen on a terminal error', async () => {
        const { status } = await jumpAndRead('formation.failedTerminally')
        expect(formationOf(status).lastError).toBe('invalidIntent')
    })

    it('should land the reconnecting screen on unsynced freshness', async () => {
        const { status } = await jumpAndRead('formation.reconnecting')
        expect(formationOf(status).freshness).toBe('unsynced')
        expect(formationOf(status).phase).toBe('formed')
    })

    it('should land the formed screen with a joined wallet service', async () => {
        const { status, simulator } = await jumpAndRead('formation.formed')
        expect(formationOf(status).phase).toBe('formed')
        expect(simulator.listMockFederations().map(f => f.id)).toContain(
            `mock-wallet-service-${formationOf(status).formationId}`,
        )
    })

    it('should land the join-failed screen with a failed join and no wallet in the list', async () => {
        const { status, simulator } = await jumpAndRead('formation.joinFailed')
        expect(formationOf(status).phase).toBe('formed')
        expect(simulator.listMockFederations().map(f => f.id)).not.toContain(
            `mock-wallet-service-${formationOf(status).formationId}`,
        )
    })

    it('should report a joining state before the failed join on the join-failed checkpoint', async () => {
        const simulator = new FiSimulator()
        const joinStates: string[] = []
        simulator.attach(
            () => {},
            (event, payload) => {
                if (event === 'fiFederationJoin')
                    joinStates.push(
                        (payload as FiFederationJoinEvent).state.type,
                    )
            },
        )
        const player = new FiPlayer(simulator)

        const run = player.run(formationCreatedJoinFails, {
            jumpTo: 'joinFailed',
        })
        await jest.advanceTimersByTimeAsync(0)
        player.cancel()
        await run

        expect(joinStates).toEqual(['joining', 'failed'])
    })

    it('should use a fresh formation id on every jump', async () => {
        const simulator = new FiSimulator()
        simulator.attach(
            () => {},
            () => {},
        )
        const session = { simulator, player: new FiPlayer(simulator) }
        const first = await jumpAndRead('formation.dkgUnderway', session)
        const second = await jumpAndRead('formation.dkgUnderway', session)
        expect(formationOf(first.status).formationId).not.toBe(
            formationOf(second.status).formationId,
        )
    })

    it('should park an authorization paid by the first eligible payer', async () => {
        const { status } = await jumpAndRead('formation.authorize')
        const formation = formationOf(status)
        expect(formation.phase).toBe('acquiringSeats')
        expect(formation.actionRequired).toMatchObject({
            type: 'authorizePayments',
            requirements: {
                totalMsats: '6300000',
                seats: expect.arrayContaining([
                    expect.objectContaining({
                        paymentFederationId: 'mock-payer-global-bitcoin',
                    }),
                ]),
            },
        })
    })

    it('should park a short authorization of ten million sats', async () => {
        const { status } = await jumpAndRead('formation.authorizeShort')
        expect(formationOf(status).actionRequired).toMatchObject({
            requirements: { totalMsats: '10000000000' },
        })
    })

    it('should continue the walk once the real authorization lands', async () => {
        const screen = findFiScreen('formation.authorize')
        if (!screen) throw new Error('no screen')
        const simulator = new FiSimulator()
        simulator.attach(
            () => {},
            () => {},
        )
        const player = new FiPlayer(simulator)
        const run = player.run(screen.script, { jumpTo: screen.checkpoint })
        await jest.advanceTimersByTimeAsync(0)
        const parked = formationOf(
            (await simulator.handle('fiClientStatus', {})) as RpcFiClientStatus,
        )
        const authorizationId =
            parked.actionRequired?.type === 'authorizePayments'
                ? parked.actionRequired.requirements.authorizationId
                : ''

        expect(
            await simulator.handle('fiClientAuthorizeReplacementPayments', {
                authorizationId,
            }),
        ).toEqual({ type: 'success' })
        await jest.advanceTimersByTimeAsync(2_000)

        expect(
            formationOf(
                (await simulator.handle(
                    'fiClientStatus',
                    {},
                )) as RpcFiClientStatus,
            ).phase,
        ).toBe('preparingDkg')
        player.cancel()
        await run
    })

    it('should park a guardian replacement with candidates to preview', async () => {
        const { status, simulator } = await jumpAndRead(
            'formation.replaceGuardian',
        )
        const formation = formationOf(status)
        expect(formation.seats[0].phase).toBe('replacementRequired')
        expect(formation.actionRequired?.type).toBe('replaceGuardians')
        expect(
            await simulator.handle('fiClientPreviewReplacements', {}),
        ).toMatchObject({ type: 'preview' })
    })

    it('should park a guardian replacement with no candidates', async () => {
        const { simulator } = await jumpAndRead(
            'formation.replaceGuardianNoCandidates',
        )
        expect(
            await simulator.handle('fiClientPreviewReplacements', {}),
        ).toMatchObject({
            type: 'error',
            error: { detail: { type: 'insufficientFmanSeats', eligible: 0 } },
        })
    })
})

const previewRequest = {
    request: { federationSize: 4, plan: 'infiniteBestEffort' },
}

describe('setup scripts', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('should leave the client idle on the create and confirm screens', async () => {
        for (const id of ['setup.create', 'setup.confirm']) {
            const { status } = await jumpAndRead(id)
            expect(status).toEqual({ type: 'ready', status: { type: 'idle' } })
        }
    })

    it('should fail the payer lookup with a registry error', async () => {
        const { simulator } = await jumpAndRead('setup.payerLookupFails')
        expect(
            await simulator.handle('fiClientEligiblePayers', {}),
        ).toMatchObject({
            type: 'error',
            error: { code: 'registry' },
        })
    })

    it('should price a seat above any balance', async () => {
        const { simulator } = await jumpAndRead('setup.insufficientBalance')
        const result = (await simulator.handle(
            'fiClientPreviewSelection',
            previewRequest,
        )) as RpcFiSelectionPreviewResult
        if (result.type !== 'preview') throw new Error('expected a preview')
        expect(BigInt(result.preview.totalAdvertisedMsats)).toBeGreaterThan(
            BigInt(1_000_000_000_000),
        )
    })

    it('should offer no joinable services', async () => {
        const { simulator } = await jumpAndRead('setup.noJoinableServices')
        const result = (await simulator.handle(
            'fiClientSetupPaymentFederations',
            {},
        )) as RpcFiSetupPaymentFederationsResult
        if (result.type !== 'federations')
            throw new Error('expected federations')
        expect(result.federations.some(f => !f.joined)).toBe(false)
    })

    it('should fail the join lookup with a registry error', async () => {
        const { simulator } = await jumpAndRead('setup.joinLookupFails')
        expect(
            await simulator.handle('fiClientSetupPaymentFederations', {}),
        ).toMatchObject({ type: 'error', error: { code: 'registry' } })
    })

    it('should delay the join lookup by six seconds and then answer normally', async () => {
        const { simulator } = await jumpAndRead('setup.slowJoinLookup')
        const pending = simulator.handle('fiClientSetupPaymentFederations', {})
        let settled = false
        pending.then(() => (settled = true))
        await jest.advanceTimersByTimeAsync(5_999)
        expect(settled).toBe(false)
        await jest.advanceTimersByTimeAsync(1)
        expect(
            (await pending) as RpcFiSetupPaymentFederationsResult,
        ).toMatchObject({ type: 'federations' })
    })

    it('should delay a quote by three seconds on the slow network', async () => {
        const { simulator } = await jumpAndRead('setup.slowNetwork')
        const pending = simulator.handle(
            'fiClientPreviewSelection',
            previewRequest,
        )
        let settled = false
        pending.then(() => (settled = true))
        await jest.advanceTimersByTimeAsync(2_999)
        expect(settled).toBe(false)
        await jest.advanceTimersByTimeAsync(1)
        expect((await pending) as RpcFiSelectionPreviewResult).toMatchObject({
            type: 'preview',
        })
    })

    it('should refuse ten guardians when only eight are eligible', async () => {
        const { simulator } = await jumpAndRead('setup.notEnoughGuardians')
        expect(
            await simulator.handle('fiClientPreviewSelection', {
                request: { federationSize: 10, plan: 'infiniteBestEffort' },
            }),
        ).toMatchObject({
            type: 'error',
            error: {
                detail: {
                    type: 'insufficientFmanSeats',
                    eligible: 8,
                    seen: 11,
                },
            },
        })
    })

    it('should expire a quote after five seconds', async () => {
        const { simulator } = await jumpAndRead('setup.selectionExpiresFast')
        const result = (await simulator.handle(
            'fiClientPreviewSelection',
            previewRequest,
        )) as RpcFiSelectionPreviewResult
        if (result.type !== 'preview') throw new Error('expected a preview')
        expect(result.preview.validUntil - Math.floor(Date.now() / 1000)).toBe(
            5,
        )
    })

    it('should ask for reauthorization on pay', async () => {
        const { simulator } = await jumpAndRead('setup.reauthorizationRequired')
        expect(
            await simulator.handle('fiClientPayAndCreate', { previewId: 'p' }),
        ).toMatchObject({
            type: 'error',
            error: {
                code: 'selectionReauthorizationRequired',
                detail: { reason: 'selectedFmanUnavailable' },
            },
        })
    })

    it('should serve two quotes and fail the third refresh', async () => {
        const { simulator } = await jumpAndRead(
            'setup.quoteRefreshLosesGuardians',
        )
        const quote = () =>
            simulator.handle('fiClientPreviewSelection', previewRequest)
        expect(await quote()).toMatchObject({ type: 'preview' })
        expect(await quote()).toMatchObject({ type: 'preview' })
        expect(await quote()).toMatchObject({
            type: 'error',
            error: { detail: { type: 'insufficientFmanSeats', requested: 4 } },
        })
    })

    it('should count quote failures per run, not per module', async () => {
        const first = await jumpAndRead('setup.quoteRefreshLosesGuardians')
        const quote = (s: FiSimulator) =>
            s.handle('fiClientPreviewSelection', previewRequest)
        await quote(first.simulator)
        await quote(first.simulator)
        const second = await jumpAndRead('setup.quoteRefreshLosesGuardians')
        expect(await quote(second.simulator)).toMatchObject({
            type: 'preview',
        })
    })

    it('should run the setup happy path into the formation walk', () => {
        expect(checkpointsOf(setupHappyPath)).toEqual([
            'create',
            'confirm',
            'paid',
            'preparing',
            'awaitingPaymentReadiness',
            'acquiringSeats',
            'preparingDkg',
            'dkgUnderway',
            'publishingSeatBindings',
            'formedJoining',
            'formed',
        ])
    })
})

describe('recovery scripts', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    const restoredOf = (status: RpcFiClientStatus) => {
        if (status.type !== 'ready' || status.status.type !== 'restored')
            throw new Error(`not restored: ${JSON.stringify(status)}`)
        return status.status.formation
    }

    it('should start unsynced with no name and no federation announced', async () => {
        const { status, simulator } = await jumpAndRead('recovery.verifying')
        expect(restoredOf(status)).toMatchObject({
            freshness: 'unsynced',
            federationName: null,
        })
        expect(
            simulator
                .listMockFederations()
                .some(f => f.id.startsWith('mock-wallet-service-')),
        ).toBe(false)
    })

    it('should be reconciled and joining on the rejoining screen', async () => {
        const events: Array<[string, unknown]> = []
        const screen = findFiScreen('recovery.rejoining')
        if (!screen) throw new Error('no screen')
        const simulator = new FiSimulator()
        simulator.attach(
            () => {},
            (event, payload) => events.push([event, payload]),
        )
        const player = new FiPlayer(simulator)
        const run = player.run(screen.script, { jumpTo: screen.checkpoint })
        await jest.advanceTimersByTimeAsync(0)

        // read the join events before the status: `fiClientStatus` replays the
        // retained join event, which would double the entry asserted here
        expect(
            events
                .map(([e, p]) =>
                    e === 'fiFederationJoin'
                        ? (p as FiFederationJoinEvent).state.type
                        : null,
                )
                .filter(Boolean),
        ).toEqual(['joining'])
        const status = restoredOf(
            (await simulator.handle('fiClientStatus', {})) as RpcFiClientStatus,
        )
        expect(status).toMatchObject({
            freshness: 'fresh',
            backupEligible: true,
            federationName: 'My Wallet Service',
        })
        player.cancel()
        await run
    })

    it('should list the federation as recovering on the restoring-balance screen', async () => {
        const { simulator } = await jumpAndRead('recovery.restoringBalance')
        expect(simulator.listMockFederations()).toContainEqual(
            expect.objectContaining({ recovering: true }),
        )
    })

    it('should list the federation as ready on the restored dashboard', async () => {
        const { simulator } = await jumpAndRead('recovery.ready')
        expect(simulator.listMockFederations()).toContainEqual(
            expect.objectContaining({
                recovering: false,
                name: 'My Wallet Service',
            }),
        )
    })

    it('should report the join as failed and never list the federation', async () => {
        const events: FiFederationJoinEvent[] = []
        const screen = findFiScreen('recovery.joinFailed')
        if (!screen) throw new Error('no screen')
        const simulator = new FiSimulator()
        simulator.attach(
            () => {},
            (event, payload) => {
                if (event === 'fiFederationJoin')
                    events.push(payload as FiFederationJoinEvent)
            },
        )
        const player = new FiPlayer(simulator)
        const run = player.run(screen.script, { jumpTo: screen.checkpoint })
        await jest.advanceTimersByTimeAsync(0)

        expect(events.map(e => e.state.type)).toEqual(['joining', 'failed'])
        expect(
            simulator
                .listMockFederations()
                .some(f => f.id.startsWith('mock-wallet-service-')),
        ).toBe(false)
        player.cancel()
        await run
    })

    it('should walk the happy path joining, recovering, then ready with real timing', async () => {
        const events: string[] = []
        const simulator = new FiSimulator()
        simulator.attach(
            () => {},
            (event, payload) => {
                if (event === 'fiFederationJoin')
                    events.push((payload as FiFederationJoinEvent).state.type)
            },
        )
        const player = new FiPlayer(simulator)
        const run = player.run(recoveryHappyPath)
        await jest.advanceTimersByTimeAsync(6_000)
        expect(events).toEqual(['joining'])
        await jest.advanceTimersByTimeAsync(8_000)
        expect(events).toEqual(['joining', 'recovering'])
        await jest.advanceTimersByTimeAsync(4_000)
        expect(events).toEqual(['joining', 'recovering', 'ready'])
        await run
    })

    it('should keep the slow join waiting a minute per stage', async () => {
        const simulator = new FiSimulator()
        simulator.attach(
            () => {},
            () => {},
        )
        const player = new FiPlayer(simulator)
        const run = player.run(recoverySlowJoin, { jumpTo: 'stillJoining' })
        await jest.advanceTimersByTimeAsync(59_999)
        expect(
            simulator
                .listMockFederations()
                .some(f => f.id.startsWith('mock-wallet-service-')),
        ).toBe(false)
        player.cancel()
        await run
    })
})

describe('lightning scripts', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    const discover = (s: FiSimulator) =>
        s.handle('fiClientLiquidityDiscover', { network: 'signet' })
    const start = (s: FiSimulator) => s.handle('fiClientLiquidityStart', {})
    const poll = (s: FiSimulator) => s.handle('fiClientLiquidityStatus', {})

    it('should be formed and joined with a provider that verifies after two polls', async () => {
        const { status, simulator } = await jumpAndRead('lightning.attaches')
        expect(formationOf(status).phase).toBe('formed')
        expect(await discover(simulator)).toMatchObject({
            type: 'discovery',
            providers: [expect.anything()],
        })
        await start(simulator)
        await poll(simulator)
        expect(await poll(simulator)).toMatchObject({
            operation: { gatewayViewVerified: true },
        })
    })

    it.each([
        ['lightning.failsRetryable', 'busy'],
        ['lightning.failsTerminally', 'capabilityUnavailable'],
    ])('should fail discovery and start on %s with %s', async (id, code) => {
        const { simulator } = await jumpAndRead(id)
        expect(await discover(simulator)).toMatchObject({
            type: 'error',
            error: { code },
        })
        expect(await start(simulator)).toMatchObject({
            type: 'error',
            error: { code },
        })
    })

    it('should admit no provider', async () => {
        const { simulator } = await jumpAndRead('lightning.noProvider')
        expect(await discover(simulator)).toEqual({
            type: 'discovery',
            providers: [],
            rejected: [],
        })
    })

    it('should reject the provider as on another network', async () => {
        const { simulator } = await jumpAndRead('lightning.wrongNetwork')
        expect(await discover(simulator)).toMatchObject({
            providers: [],
            rejected: [{ code: 'networkUnsupported' }],
        })
    })

    it('should report the operation rejected on the first status read', async () => {
        const { simulator } = await jumpAndRead('lightning.rejected')
        await start(simulator)
        expect(await poll(simulator)).toMatchObject({
            operation: { phase: 'rejected', rejectionCode: 'intentRefused' },
        })
    })

    it('should never verify', async () => {
        const { simulator } = await jumpAndRead('lightning.neverVerifies')
        await start(simulator)
        for (let i = 0; i < 5; i++) await poll(simulator)
        expect(await poll(simulator)).toMatchObject({
            operation: { gatewayViewVerified: false },
        })
    })

    it('should already be attaching, unverified, on the settings sheet', async () => {
        const { screen, simulator } = await jumpAndRead(
            'lightning.alreadyAttaching',
        )
        expect(screen.route).toBe('WalletServiceSettings')
        expect(screen.params).toEqual({ openSheet: 'provider' })
        expect(
            await simulator.handle('fiClientLiquidityCurrent', {}),
        ).toMatchObject({ operation: { gatewayViewVerified: false } })
        await poll(simulator)
        await poll(simulator)
        expect(await poll(simulator)).toMatchObject({
            operation: { gatewayViewVerified: false },
        })
    })

    it('should already be attached and verified on the settings sheet', async () => {
        const { simulator } = await jumpAndRead('lightning.alreadyAttached')
        expect(
            await simulator.handle('fiClientLiquidityCurrent', {}),
        ).toMatchObject({ operation: { gatewayViewVerified: true } })
    })
})

describe('script catalogue', () => {
    it('should list every script exactly once with a unique name', () => {
        const names = FI_SCRIPT_GROUPS.flatMap(g => g.scripts.map(s => s.name))
        expect(new Set(names).size).toBe(names.length)
        for (const group of FI_SCREEN_GROUPS)
            for (const screen of group.screens)
                expect(names).toContain(screen.script.name)
    })

    it('should find a script by name', () => {
        expect(findFiScript('formation.happyPath')).toBe(formationHappyPath)
        expect(findFiScript('nope')).toBeUndefined()
    })
})
