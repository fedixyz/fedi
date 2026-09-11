import {
    FORMATION_PHASES,
    formationAt,
    formationStatus,
    IDLE_STATUS,
    restoredStatus,
    withAuthorization,
    withError,
    withReplacement,
    withUnsynced,
} from '../../../../devtools/fi/status'

const SEED = { formationId: 'formation_test' }

describe('formation status builders', () => {
    it('should build a snapshot at the requested phase with seats in the matching seat phase', () => {
        const formation = formationAt(SEED, 'dkgUnderway')

        expect(formation.formationId).toBe('formation_test')
        expect(formation.phase).toBe('dkgUnderway')
        expect(formation.seats).toHaveLength(4)
        expect(
            formation.seats.every(seat => seat.phase === 'dkgUnderway'),
        ).toBe(true)
        expect(formation.freshness).toBe('fresh')
        expect(formation.lastError).toBeNull()
        expect(formation.actionRequired).toBeNull()
    })

    it('should flip milestones on the phases the progress screen ties them to', () => {
        expect(formationAt(SEED, 'preparing').milestones).toEqual({
            ecashSent: false,
            guardiansConfirmed: false,
            walletServiceCreated: false,
        })
        expect(formationAt(SEED, 'acquiringSeats').milestones.ecashSent).toBe(
            true,
        )
        expect(formationAt(SEED, 'acquiringSeats').paymentOutputsStarted).toBe(
            true,
        )
        expect(
            formationAt(SEED, 'dkgUnderway').milestones.guardiansConfirmed,
        ).toBe(true)
        expect(
            formationAt(SEED, 'formed').milestones.walletServiceCreated,
        ).toBe(true)
        expect(formationAt(SEED, 'formed').inviteCode).not.toBeNull()
    })

    it('should honour the seed overrides', () => {
        const formation = formationAt(
            {
                ...SEED,
                federationName: 'Named',
                federationSize: 7,
                seatPriceMsats: 1_000,
            },
            'preparing',
        )

        expect(formation.intent.federationName).toBe('Named')
        expect(formation.intent.federationSize).toBe(7)
        expect(formation.seats).toHaveLength(7)
        expect(formation.intent.maxTotalMsats).toBe(String(7 * 1_000))
    })

    it('should not mutate the input when adding an error or unsynced freshness', () => {
        const formation = formationAt(SEED, 'dkgUnderway')

        const failed = withError(formation, 'fleetManager')
        const stale = withUnsynced(formation)

        expect(failed.lastError).toBe('fleetManager')
        expect(stale.freshness).toBe('unsynced')
        expect(formation.lastError).toBeNull()
        expect(formation.freshness).toBe('fresh')
    })

    it('should wrap a snapshot as a formation status and expose idle', () => {
        const formation = formationAt(SEED, 'preparing')

        expect(formationStatus(formation)).toEqual({
            type: 'formation',
            formation,
        })
        expect(IDLE_STATUS).toEqual({ type: 'idle' })
    })

    it('should accept every phase in the timeline', () => {
        for (const phase of FORMATION_PHASES) {
            expect(formationAt(SEED, phase).phase).toBe(phase)
        }
    })

    it('should park an authorization on the seats it names, paid by the given wallet', () => {
        const parked = withAuthorization(formationAt(SEED, 'acquiringSeats'), {
            authorizationId: 'auth_1',
            amountSats: 6_300,
            payerFederationId: 'payer_1',
        })

        expect(parked.actionRequired).toEqual({
            type: 'authorizePayments',
            requirements: {
                authorizationId: 'auth_1',
                totalMsats: '6300000',
                maxTotalMsats: parked.intent.maxTotalMsats,
                seats: [0, 1, 2].map(index => ({
                    index,
                    fmanId: `fman_${SEED.formationId}_${index}`,
                    fmanName: `guardian ${index + 1}`,
                    quoteId: `quote_${index}`,
                    paymentFederationId: 'payer_1',
                    amountMsats: '2100000',
                })),
            },
        })
        expect(parked.paymentOutputsStarted).toBe(true)
    })

    it('should park a replacement of seat 0, regressing it and un-ticking the guardians milestone', () => {
        const parked = withReplacement(formationAt(SEED, 'dkgUnderway'), {
            replacementId: 'replacement_1',
        })

        expect(parked.seats[0].phase).toBe('replacementRequired')
        expect(parked.seats[1].phase).toBe('dkgUnderway')
        expect(parked.milestones.guardiansConfirmed).toBe(false)
        expect(parked.actionRequired).toEqual({
            type: 'replaceGuardians',
            requirements: {
                replacementId: 'replacement_1',
                seats: [
                    {
                        index: 0,
                        previousFmanId: `fman_${SEED.formationId}_0`,
                        previousFmanName: 'guardian 1',
                        previousQuoteId: 'quote_0',
                        previousLocator: parked.seats[0].locator,
                    },
                ],
            },
        })
    })

    it('should not mutate the snapshot it parks', () => {
        const base = formationAt(SEED, 'dkgUnderway')
        withReplacement(base, { replacementId: 'r' })
        withAuthorization(base, {
            authorizationId: 'a',
            amountSats: 1,
            payerFederationId: 'p',
        })
        expect(base.seats[0].phase).toBe('dkgUnderway')
        expect(base.actionRequired).toBeNull()
    })

    it('should build a restored status that is unsynced and nameless until reconciled', () => {
        const status = restoredStatus(SEED, { freshness: 'unsynced' })

        expect(status).toEqual({
            type: 'restored',
            formation: {
                snapshotGeneration: 3,
                formationId: SEED.formationId,
                federationInvite: `fed1${'sim'.padEnd(40, '0')}${SEED.formationId}`,
                federationName: null,
                seats: expect.any(Array),
                phase: 'formed',
                freshness: 'unsynced',
                backupEligible: false,
            },
        })
        if (status.type !== 'restored') throw new Error('expected restored')
        expect(status.formation.seats).toHaveLength(10)
        expect(status.formation.seats[0]).toEqual({
            fmanId: expect.stringMatching(/^fman_/),
            seatId: 'seat_0',
            locator: '{"version":1}',
        })
    })

    it('should build a reconciled restored status with a name and backup eligibility', () => {
        const status = restoredStatus(SEED, {
            freshness: 'fresh',
            backupEligible: true,
            federationName: 'My Wallet Service',
        })
        if (status.type !== 'restored') throw new Error('expected restored')
        expect(status.formation.freshness).toBe('fresh')
        expect(status.formation.backupEligible).toBe(true)
        expect(status.formation.federationName).toBe('My Wallet Service')
    })
})
