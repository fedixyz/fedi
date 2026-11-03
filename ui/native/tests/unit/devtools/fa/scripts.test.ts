import type {
    FaFederationJoinEvent,
    GuardianStatus,
    RpcFaClientStatus,
    RpcFaFormationSnapshot,
    RpcFaFormedFederation,
    RpcFaGuardianTransferResult,
    RpcFaSelectionPreviewResult,
    RpcFaSetupPaymentFederationsResult,
    RpcFaTransferDestinationPreviewResult,
} from '@fedi/common/types/bindings'

import { FaPlayer } from '../../../../devtools/fa/player'
import { FA_SCREEN_GROUPS, findFaScreen } from '../../../../devtools/fa/screens'
import { FA_SCRIPT_GROUPS, findFaScript } from '../../../../devtools/fa/scripts'
import {
    formationCreatedJoinFails,
    formationHappyPath,
} from '../../../../devtools/fa/scripts/formation'
import {
    recoveryHappyPath,
    recoverySlowJoin,
} from '../../../../devtools/fa/scripts/recovery'
import { setupHappyPath } from '../../../../devtools/fa/scripts/setup'
import { TRANSFER_SEAT_INDEX } from '../../../../devtools/fa/scripts/transfer'
import { FaSimulator } from '../../../../devtools/fa/simulator'
import { checkpointsOf } from '../../../../devtools/fa/steps'

const formationOf = (status: RpcFaClientStatus): RpcFaFormationSnapshot => {
    if (status.type !== 'ready' || status.status.type !== 'formation')
        throw new Error(`not a formation: ${JSON.stringify(status)}`)
    return status.status.formation
}

const formedOf = (status: RpcFaClientStatus): RpcFaFormedFederation => {
    if (status.type !== 'ready' || status.status.type !== 'formed')
        throw new Error(`not formed: ${JSON.stringify(status)}`)
    return status.status.federation
}

// optional `session` lets a test reuse one simulator/player pair across
// jumps, e.g. to prove the player's formation id keeps advancing rather than
// resetting with a fresh simulator every time
const jumpAndRead = async (
    screenId: string,
    session?: { simulator: FaSimulator; player: FaPlayer },
) => {
    const screen = findFaScreen(screenId)
    if (!screen) throw new Error(`no screen ${screenId}`)
    const simulator = session?.simulator ?? new FaSimulator()
    if (!session)
        simulator.attach(
            () => {},
            () => {},
        )
    const player = session?.player ?? new FaPlayer(simulator)
    const run = player.run(screen.script, { jumpTo: screen.checkpoint })
    await jest.advanceTimersByTimeAsync(0)
    const status = (await simulator.handle(
        'faClientStatus',
        {},
    )) as RpcFaClientStatus
    player.cancel()
    await run
    return { screen, simulator, status }
}

describe('formation scripts', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('should give every script at least one checkpoint and unique checkpoint names', () => {
        for (const script of [
            ...FA_SCRIPT_GROUPS.flatMap(g => g.scripts),
            ...FA_SCREEN_GROUPS.flatMap(g => g.screens.map(s => s.script)),
        ]) {
            const names = checkpointsOf(script)
            expect(names.length).toBeGreaterThan(0)
            expect(new Set(names).size).toBe(names.length)
        }
    })

    it('should point every screen at a checkpoint its script defines', () => {
        for (const group of FA_SCREEN_GROUPS) {
            for (const screen of group.screens) {
                expect(checkpointsOf(screen.script)).toContain(
                    screen.checkpoint,
                )
                expect(findFaScreen(screen.id)).toBe(screen)
            }
        }
    })

    it('should have unique screen ids across groups', () => {
        const ids = FA_SCREEN_GROUPS.flatMap(g => g.screens.map(s => s.id))
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('should land each formation phase screen on its phase', async () => {
        for (const phase of [
            'acquiringSeats',
            'dkgUnderway',
            'dkgComplete',
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
        expect(formationOf(status).lastError).toBe('manifoldGuardian')
    })

    it('should land the terminal failure screen on a terminal error', async () => {
        const { status } = await jumpAndRead('formation.failedTerminally')
        expect(formationOf(status).lastError).toBe('invalidIntent')
    })

    it('should land the reconnecting screen on unsynced freshness', async () => {
        const { status } = await jumpAndRead('formation.reconnecting')
        expect(formedOf(status)).toMatchObject({
            freshness: 'unsynced',
            backupEligible: true,
        })
    })

    it('should land the formed screen with a joined wallet service', async () => {
        const { status, simulator } = await jumpAndRead('formation.formed')
        expect(formedOf(status)).toMatchObject({
            freshness: 'fresh',
            backupEligible: true,
        })
        expect(simulator.listMockFederations().map(f => f.id)).toContain(
            `mock-wallet-service-${formedOf(status).formationId}`,
        )
    })

    it('should land the join-failed screen with a failed join and no wallet in the list', async () => {
        const { status, simulator } = await jumpAndRead('formation.joinFailed')
        expect(simulator.listMockFederations().map(f => f.id)).not.toContain(
            `mock-wallet-service-${formedOf(status).formationId}`,
        )
    })

    it('should report a joining state before the failed join on the join-failed checkpoint', async () => {
        const simulator = new FaSimulator()
        const joinStates: string[] = []
        simulator.attach(
            () => {},
            (event, payload) => {
                if (event === 'faFederationJoin')
                    joinStates.push(
                        (payload as FaFederationJoinEvent).state.type,
                    )
            },
        )
        const player = new FaPlayer(simulator)

        const run = player.run(formationCreatedJoinFails, {
            jumpTo: 'joinFailed',
        })
        await jest.advanceTimersByTimeAsync(0)
        player.cancel()
        await run

        expect(joinStates).toEqual(['joining', 'failed'])
    })

    it('should use a fresh formation id on every jump', async () => {
        const simulator = new FaSimulator()
        simulator.attach(
            () => {},
            () => {},
        )
        const session = { simulator, player: new FaPlayer(simulator) }
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
        const screen = findFaScreen('formation.authorize')
        if (!screen) throw new Error('no screen')
        const simulator = new FaSimulator()
        simulator.attach(
            () => {},
            () => {},
        )
        const player = new FaPlayer(simulator)
        const run = player.run(screen.script, { jumpTo: screen.checkpoint })
        await jest.advanceTimersByTimeAsync(0)
        const parked = formationOf(
            (await simulator.handle('faClientStatus', {})) as RpcFaClientStatus,
        )
        const authorizationId =
            parked.actionRequired?.type === 'authorizePayments'
                ? parked.actionRequired.requirements.authorizationId
                : ''

        expect(
            await simulator.handle('faClientAuthorizeReplacementPayments', {
                authorizationId,
            }),
        ).toEqual({ type: 'success' })
        await jest.advanceTimersByTimeAsync(2_000)

        expect(
            formationOf(
                (await simulator.handle(
                    'faClientStatus',
                    {},
                )) as RpcFaClientStatus,
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
            await simulator.handle('faClientPreviewReplacements', {}),
        ).toMatchObject({ type: 'preview' })
    })

    it('should park a guardian replacement with no candidates', async () => {
        const { simulator } = await jumpAndRead(
            'formation.replaceGuardianNoCandidates',
        )
        expect(
            await simulator.handle('faClientPreviewReplacements', {}),
        ).toMatchObject({
            type: 'error',
            error: { detail: { type: 'insufficientMgSeats', eligible: 0 } },
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
            await simulator.handle('faClientEligiblePayers', {}),
        ).toMatchObject({
            type: 'error',
            error: { code: 'registry' },
        })
    })

    it('should price a seat above any balance', async () => {
        const { simulator } = await jumpAndRead('setup.insufficientBalance')
        const result = (await simulator.handle(
            'faClientPreviewSelection',
            previewRequest,
        )) as RpcFaSelectionPreviewResult
        if (result.type !== 'preview') throw new Error('expected a preview')
        expect(BigInt(result.preview.totalAdvertisedMsats)).toBeGreaterThan(
            BigInt(1_000_000_000_000),
        )
    })

    it('should offer no joinable services', async () => {
        const { simulator } = await jumpAndRead('setup.noJoinableServices')
        const result = (await simulator.handle(
            'faClientSetupPaymentFederations',
            {},
        )) as RpcFaSetupPaymentFederationsResult
        if (result.type !== 'federations')
            throw new Error('expected federations')
        expect(result.federations.some(f => !f.joined)).toBe(false)
    })

    it('should fail the join lookup with a registry error', async () => {
        const { simulator } = await jumpAndRead('setup.joinLookupFails')
        expect(
            await simulator.handle('faClientSetupPaymentFederations', {}),
        ).toMatchObject({ type: 'error', error: { code: 'registry' } })
    })

    it('should delay the join lookup by six seconds and then answer normally', async () => {
        const { simulator } = await jumpAndRead('setup.slowJoinLookup')
        const pending = simulator.handle('faClientSetupPaymentFederations', {})
        let settled = false
        pending.then(() => (settled = true))
        await jest.advanceTimersByTimeAsync(5_999)
        expect(settled).toBe(false)
        await jest.advanceTimersByTimeAsync(1)
        expect(
            (await pending) as RpcFaSetupPaymentFederationsResult,
        ).toMatchObject({ type: 'federations' })
    })

    it('should delay a quote by three seconds on the slow network', async () => {
        const { simulator } = await jumpAndRead('setup.slowNetwork')
        const pending = simulator.handle(
            'faClientPreviewSelection',
            previewRequest,
        )
        let settled = false
        pending.then(() => (settled = true))
        await jest.advanceTimersByTimeAsync(2_999)
        expect(settled).toBe(false)
        await jest.advanceTimersByTimeAsync(1)
        expect((await pending) as RpcFaSelectionPreviewResult).toMatchObject({
            type: 'preview',
        })
    })

    it('should refuse ten guardians when only eight are eligible', async () => {
        const { simulator } = await jumpAndRead('setup.notEnoughGuardians')
        expect(
            await simulator.handle('faClientPreviewSelection', {
                request: { federationSize: 10, plan: 'infiniteBestEffort' },
            }),
        ).toMatchObject({
            type: 'error',
            error: {
                detail: {
                    type: 'insufficientMgSeats',
                    eligible: 8,
                    seen: 11,
                },
            },
        })
    })

    it('should expire a quote after five seconds', async () => {
        const { simulator } = await jumpAndRead('setup.selectionExpiresFast')
        const result = (await simulator.handle(
            'faClientPreviewSelection',
            previewRequest,
        )) as RpcFaSelectionPreviewResult
        if (result.type !== 'preview') throw new Error('expected a preview')
        expect(result.preview.validUntil - Math.floor(Date.now() / 1000)).toBe(
            5,
        )
    })

    it('should ask for reauthorization on pay', async () => {
        const { simulator } = await jumpAndRead('setup.reauthorizationRequired')
        expect(
            await simulator.handle('faClientPayAndCreate', { previewId: 'p' }),
        ).toMatchObject({
            type: 'error',
            error: {
                code: 'selectionReauthorizationRequired',
                detail: { reason: 'selectedMgUnavailable' },
            },
        })
    })

    it('should serve two quotes and fail the third refresh', async () => {
        const { simulator } = await jumpAndRead(
            'setup.quoteRefreshLosesGuardians',
        )
        const quote = () =>
            simulator.handle('faClientPreviewSelection', previewRequest)
        expect(await quote()).toMatchObject({ type: 'preview' })
        expect(await quote()).toMatchObject({ type: 'preview' })
        expect(await quote()).toMatchObject({
            type: 'error',
            error: { detail: { type: 'insufficientMgSeats', requested: 4 } },
        })
    })

    it('should count quote failures per run, not per module', async () => {
        const first = await jumpAndRead('setup.quoteRefreshLosesGuardians')
        const quote = (s: FaSimulator) =>
            s.handle('faClientPreviewSelection', previewRequest)
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
            'dkgComplete',
            'publishingSeatBindings',
            'formedJoining',
            'formed',
        ])
    })
})

describe('recovery scripts', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('should start unsynced with no name and no federation announced', async () => {
        const { status, simulator } = await jumpAndRead('recovery.verifying')
        expect(formedOf(status)).toMatchObject({
            freshness: 'unsynced',
            backupEligible: false,
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
        const screen = findFaScreen('recovery.rejoining')
        if (!screen) throw new Error('no screen')
        const simulator = new FaSimulator()
        simulator.attach(
            () => {},
            (event, payload) => events.push([event, payload]),
        )
        const player = new FaPlayer(simulator)
        const run = player.run(screen.script, { jumpTo: screen.checkpoint })
        await jest.advanceTimersByTimeAsync(0)

        // read the join events before the status: `faClientStatus` replays the
        // retained join event, which would double the entry asserted here
        expect(
            events
                .map(([e, p]) =>
                    e === 'faFederationJoin'
                        ? (p as FaFederationJoinEvent).state.type
                        : null,
                )
                .filter(Boolean),
        ).toEqual(['joining'])
        const status = formedOf(
            (await simulator.handle('faClientStatus', {})) as RpcFaClientStatus,
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
                balance: 21_000_000,
            }),
        )
    })

    it('should report the join as failed and never list the federation', async () => {
        const events: FaFederationJoinEvent[] = []
        const screen = findFaScreen('recovery.joinFailed')
        if (!screen) throw new Error('no screen')
        const simulator = new FaSimulator()
        simulator.attach(
            () => {},
            (event, payload) => {
                if (event === 'faFederationJoin')
                    events.push(payload as FaFederationJoinEvent)
            },
        )
        const player = new FaPlayer(simulator)
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
        const simulator = new FaSimulator()
        simulator.attach(
            () => {},
            (event, payload) => {
                if (event === 'faFederationJoin')
                    events.push((payload as FaFederationJoinEvent).state.type)
            },
        )
        const player = new FaPlayer(simulator)
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
        const simulator = new FaSimulator()
        simulator.attach(
            () => {},
            () => {},
        )
        const player = new FaPlayer(simulator)
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

    const discover = (s: FaSimulator) =>
        s.handle('faClientLiquidityDiscover', { network: 'signet' })
    const start = (s: FaSimulator) => s.handle('faClientLiquidityStart', {})
    const poll = (s: FaSimulator) => s.handle('faClientLiquidityStatus', {})

    it('should be formed and joined with a provider that verifies after two polls', async () => {
        const { status, simulator } = await jumpAndRead('lightning.attaches')
        expect(formedOf(status).freshness).toBe('fresh')
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
            await simulator.handle('faClientLiquidityCurrent', {}),
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
            await simulator.handle('faClientLiquidityCurrent', {}),
        ).toMatchObject({ operation: { gatewayViewVerified: true } })
    })
})

describe('settings scripts', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('should refuse an auto-join save as unsupported by the guardians', async () => {
        const { status, simulator } = await jumpAndRead(
            'settings.autojoinUnsupported',
        )

        expect(formedOf(status).freshness).toBe('fresh')
        expect(
            await simulator.handle('faClientUpdateFederationMetadata', {
                update: {
                    type: 'appSetting',
                    setting: 'autojoinCommunities',
                    value: '["fedi:community1signal"]',
                },
            }),
        ).toEqual({
            type: 'error',
            error: {
                code: 'maintenanceRejected',
                message: 'simulated guardians without auto join support',
                detail: { type: 'maintenanceUnsupported' },
            },
        })
    })
})

describe('guardian transfer scripts', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    /** What a fresh subscribe to the transfer stream sends first. */
    const readTransfer = async (simulator: FaSimulator) => {
        const sent: unknown[] = []
        simulator.attach(update => sent.push(update.data))
        await simulator.handle('faClientSubscribeGuardianTransfer', {
            streamId: 900,
        })
        await jest.advanceTimersByTimeAsync(0)
        await simulator.handle('streamCancel', { streamId: 900 })
        const result = sent[0] as RpcFaGuardianTransferResult | undefined
        if (result?.type !== 'transfer')
            throw new Error(`not a transfer: ${JSON.stringify(result)}`)
        return result.transfer
    }

    const preview = (simulator: FaSimulator) =>
        simulator.handle('faClientPreviewTransferDestination', {
            seatIndex: 2,
        }) as Promise<RpcFaTransferDestinationPreviewResult>

    it('should list the replacement screens in flow order, one script each', () => {
        const group = FA_SCREEN_GROUPS.find(
            g => g.title === 'Guardian replacement',
        )
        const ids = group?.screens.map(screen => screen.id)
        expect(ids).toEqual([
            'transfer.settingsEntry',
            'transfer.dashboardFlagged',
            'transfer.dashboardFlaggedMany',
            'transfer.sheetEntry',
            'transfer.sheetOfflineNotFlagged',
            'transfer.pick',
            'transfer.noneFlagged',
            'transfer.notChecked',
            'transfer.searching',
            'transfer.reviewPriced',
            'transfer.reviewFree',
            'transfer.quoteExpiring',
            'transfer.notEnoughFunds',
            'transfer.hostChanged',
            'transfer.noFreeHost',
            'transfer.startBusy',
            'transfer.paymentFails',
            'transfer.unavailable',
            'transfer.notEligible',
            'transfer.buyingSeat',
            'transfer.awaitingSource',
            'transfer.publishingBinding',
            'transfer.removingSource',
            'transfer.dashboardWaiting',
            'transfer.runToDone',
            'transfer.flagOffSettings',
            'transfer.flagOffSheet',
        ])
        const scripts = group?.screens.map(screen => screen.script)
        expect(new Set(scripts).size).toBe(scripts?.length)
    })

    it('should land each entry on the screen it opens from', () => {
        expect(findFaScreen('transfer.settingsEntry')).toMatchObject({
            route: 'WalletServiceSettings',
        })
        expect(findFaScreen('transfer.sheetEntry')).toMatchObject({
            route: 'WalletServiceDashboard',
            params: { openSheet: 'guardians' },
        })
        expect(findFaScreen('transfer.pick')).toMatchObject({
            route: 'WalletServiceGuardianTransfer',
        })
        expect(findFaScreen('transfer.pick')).not.toHaveProperty('params')
        for (const id of [
            'transfer.searching',
            'transfer.reviewPriced',
            'transfer.notEnoughFunds',
            'transfer.paymentFails',
        ])
            expect(findFaScreen(id)).toMatchObject({
                route: 'WalletServiceGuardianTransfer',
                params: { seatIndex: TRANSFER_SEAT_INDEX },
            })
    })

    it('should force the flag on every guardian replacement screen but the flag-off ones', () => {
        const group = FA_SCREEN_GROUPS.find(
            g => g.title === 'Guardian replacement',
        )
        const flagOff = ['transfer.flagOffSettings', 'transfer.flagOffSheet']
        for (const screen of group?.screens ?? [])
            expect(screen.features).toEqual({
                wallet_service_guardian_transfer: flagOff.includes(screen.id)
                    ? null
                    : {},
            })
        const others = FA_SCREEN_GROUPS.filter(g => g !== group).flatMap(
            g => g.screens,
        )
        expect(others.filter(screen => screen.features)).toEqual([])
    })

    it('should report the replaced guardian as not responding on the sheet', async () => {
        for (const id of ['transfer.sheetEntry', 'transfer.flagOffSheet']) {
            const { simulator } = await jumpAndRead(id)
            const statuses = (await simulator.handle('getGuardianStatus', {
                federationId: 'any',
            })) as GuardianStatus[]
            expect(statuses.length).toBeGreaterThan(TRANSFER_SEAT_INDEX)
            for (const [index, status] of statuses.entries())
                expect(Object.keys(status)).toEqual([
                    index === TRANSFER_SEAT_INDEX ? 'timeout' : 'online',
                ])
        }
    })

    it('should report the not-responding guardian to the read the federation event starts', async () => {
        for (const id of ['transfer.sheetEntry', 'transfer.flagOffSheet']) {
            const simulator = new FaSimulator()
            const reads: Promise<unknown>[] = []
            simulator.attach(
                () => {},
                // the app reads guardian status the moment the federation
                // lands, and caches that answer for the dashboard's mount
                (event, payload) => {
                    if (event === 'federation')
                        reads.push(
                            simulator.handle('getGuardianStatus', {
                                federationId: (payload as { id: string }).id,
                            }),
                        )
                },
            )
            await jumpAndRead(id, {
                simulator,
                player: new FaPlayer(simulator),
            })

            expect(reads.length).toBeGreaterThan(0)
            const statuses = (await reads[0]) as GuardianStatus[]
            expect(Object.keys(statuses[TRANSFER_SEAT_INDEX])).toEqual([
                'timeout',
            ])
        }
    })

    it('should land each progress screen on its phase and hold it there', async () => {
        for (const [id, phase] of [
            ['transfer.buyingSeat', 'buyingSeat'],
            ['transfer.awaitingSource', 'awaitingSource'],
            ['transfer.publishingBinding', 'publishingBinding'],
            ['transfer.removingSource', 'removingSource'],
        ] as const) {
            const { simulator } = await jumpAndRead(id)
            expect((await readTransfer(simulator))?.phase).toBe(phase)
            await jest.advanceTimersByTimeAsync(60_000)
            expect((await readTransfer(simulator))?.phase).toBe(phase)
        }
    })

    it('should stream the done screen one phase at a time, then completed with the new host seated', async () => {
        const simulator = new FaSimulator()
        const sent: RpcFaGuardianTransferResult[] = []
        simulator.attach(update => {
            if (update.stream_id === 7)
                sent.push(update.data as RpcFaGuardianTransferResult)
        })
        const screen = findFaScreen('transfer.runToDone')
        if (!screen) throw new Error('no screen transfer.runToDone')
        const player = new FaPlayer(simulator)
        const run = player.run(screen.script, { jumpTo: screen.checkpoint })
        await simulator.handle('faClientSubscribeGuardianTransfer', {
            streamId: 7,
        })
        await jest.advanceTimersByTimeAsync(0)
        const phases = () =>
            sent.map(item =>
                item.type === 'transfer' ? item.transfer?.phase : item.type,
            )
        expect(phases()).toEqual(['buyingSeat'])

        // each phase holds long enough to read before the next one lands
        await jest.advanceTimersByTimeAsync(3_999)
        expect(phases()).toEqual(['buyingSeat'])
        await jest.advanceTimersByTimeAsync(1)
        expect(phases()).toEqual(['buyingSeat', 'awaitingSource'])

        await jest.advanceTimersByTimeAsync(12_000)
        await run
        // the bridge reports `completed` itself rather than dropping the move
        expect(phases()).toEqual([
            'buyingSeat',
            'awaitingSource',
            'publishingBinding',
            'removingSource',
            'completed',
        ])
        expect(await readTransfer(simulator)).toMatchObject({
            phase: 'completed',
        })
        const status = (await simulator.handle(
            'faClientStatus',
            {},
        )) as RpcFaClientStatus
        if (status.type !== 'ready' || status.status.type !== 'formed')
            throw new Error('not formed')
        expect(status.status.federation.seats[TRANSFER_SEAT_INDEX].mgName).toBe(
            'quiet-harbor',
        )
    })

    it('should answer and stream a start with the move waiting for the old host, and keep it', async () => {
        const { simulator } = await jumpAndRead('transfer.pick')
        expect(await readTransfer(simulator)).toBeNull()

        // the start moves the guardian the preview was for
        await simulator.handle('faClientPreviewTransferDestination', {
            seatIndex: 0,
        })
        expect(
            await simulator.handle('faClientStartGuardianTransfer', {}),
        ).toMatchObject({
            transfer: {
                phase: 'awaitingSource',
                seatIndex: 0,
                sourceMgName: 'amber-otter',
            },
        })
        await jest.advanceTimersByTimeAsync(60_000)
        expect(await readTransfer(simulator)).toMatchObject({
            phase: 'awaitingSource',
            seatIndex: 0,
        })
    })

    it('should price each review screen as its label says', async () => {
        for (const [id, price] of [
            ['transfer.reviewPriced', '2100000'],
            ['transfer.reviewFree', '0'],
            ['transfer.notEnoughFunds', '2000000000'],
        ] as const) {
            const { simulator } = await jumpAndRead(id)
            expect(await preview(simulator)).toMatchObject({
                preview: { advertisedPriceMsats: price },
            })
        }
    })

    it('should expire the first quote in 5 s and refresh to the same host', async () => {
        const { simulator } = await jumpAndRead('transfer.quoteExpiring')
        const first = await preview(simulator)
        if (first.type !== 'preview') throw new Error('no first preview')
        expect(first.preview.validUntil - Math.floor(Date.now() / 1000)).toBe(5)

        const second = preview(simulator)
        await jest.advanceTimersByTimeAsync(2_000)
        expect(await second).toMatchObject({
            preview: {
                mgId: first.preview.mgId,
                advertisedPriceMsats: '2100000',
            },
        })
    })

    it('should refresh the host-changed quote to another host at a new price', async () => {
        const { simulator } = await jumpAndRead('transfer.hostChanged')
        const first = await preview(simulator)
        if (first.type !== 'preview') throw new Error('no first preview')

        const second = preview(simulator)
        await jest.advanceTimersByTimeAsync(1_000)
        const refreshed = await second
        if (refreshed.type !== 'preview') throw new Error('no refresh')
        expect(refreshed.preview.mgId).not.toBe(first.preview.mgId)
        expect(refreshed.preview.advertisedPriceMsats).toBe('2350000')
    })

    it('should answer from the first turn again after a second jump', async () => {
        const simulator = new FaSimulator()
        simulator.attach(
            () => {},
            () => {},
        )
        const session = { simulator, player: new FaPlayer(simulator) }
        for (let jump = 0; jump < 2; jump++) {
            await jumpAndRead('transfer.noFreeHost', session)
            expect(await preview(simulator)).toMatchObject({
                type: 'error',
                error: { detail: { type: 'insufficientMgSeats' } },
            })
            expect(await preview(simulator)).toMatchObject({
                type: 'preview',
            })
        }
    })

    it('should fail each start error screen with its code and open no move', async () => {
        for (const [id, code] of [
            ['transfer.startBusy', 'busy'],
            ['transfer.paymentFails', 'payment'],
            ['transfer.unavailable', 'capabilityUnavailable'],
        ] as const) {
            const { simulator } = await jumpAndRead(id)
            expect(
                await simulator.handle('faClientStartGuardianTransfer', {
                    seatIndex: TRANSFER_SEAT_INDEX,
                }),
            ).toMatchObject({ type: 'error', error: { code } })
            await jest.advanceTimersByTimeAsync(60_000)
            expect(await readTransfer(simulator)).toBeNull()
        }
    })
})

describe('script catalogue', () => {
    it('should list every script exactly once with a unique name', () => {
        const names = FA_SCRIPT_GROUPS.flatMap(g => g.scripts.map(s => s.name))
        expect(new Set(names).size).toBe(names.length)
        for (const group of FA_SCREEN_GROUPS.filter(
            g => g.title !== 'Guardian replacement',
        ))
            for (const screen of group.screens)
                expect(names).toContain(screen.script.name)
    })

    // each replacement script stops at its checkpoint with no wait, so a
    // play from the start would only repeat the jump without navigating
    it('should offer the guardian replacement states as screen jumps only', () => {
        const names = FA_SCRIPT_GROUPS.flatMap(g => g.scripts.map(s => s.name))
        const group = FA_SCREEN_GROUPS.find(
            g => g.title === 'Guardian replacement',
        )
        expect(group?.screens.length).toBeGreaterThan(0)
        for (const screen of group?.screens ?? [])
            expect(names).not.toContain(screen.script.name)
    })

    it('should find a script by name', () => {
        expect(findFaScript('formation.happyPath')).toBe(formationHappyPath)
        expect(findFaScript('nope')).toBeUndefined()
    })
})
