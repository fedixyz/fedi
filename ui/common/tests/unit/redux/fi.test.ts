import {
    FiState,
    RECOMMENDED_WALLET_SERVICE_SIZE,
    WalletServiceCreationStage,
    applyWalletServiceReplacements,
    authorizeWalletServicePayments,
    clearFiOperationError,
    createWalletService,
    describeFiClientStatusChange,
    getWalletServiceCreationStage,
    getWalletServiceErrorKey,
    isTerminalWalletServiceError,
    prepareWalletServicePayment,
    previewWalletServiceReplacements,
    resumeWalletService,
    selectCanPayForWalletService,
    selectFiPaymentRequirements,
    selectFiReplacementRequirements,
    selectWalletServiceCreationProgress,
    selectWalletServiceFlowStatus,
    selectWalletServiceGuardianProgress,
    selectWalletServicePayerAvailability,
    selectWalletServicePaymentShortfall,
    selectWalletServiceReplacementPreview,
    setFederations,
    setFiClientStatus,
    setFiStatus,
    setPayFromFederationId,
    setWalletServiceDraft,
    setupStore,
} from '../../../redux'
import { MSats } from '../../../types'
import {
    RpcFiEligiblePayer,
    RpcFiErrorCode,
    RpcFiFormationActionRequired,
    RpcFiFormationMilestones,
    RpcFiFormationSnapshot,
    RpcFiGuardianReplacementRequirements,
    RpcFiOperationError,
    RpcFiPaymentRequirements,
    RpcFiReplacementPreview,
    RpcFiSeatProgress,
    RpcFiSelectionPreview,
} from '../../../types/bindings'
import { mockFederation1 } from '../../mock-data/federation'
import { createMockFedimintBridge } from '../../utils/fedimint'

/*** Fixtures ***/

const makeMilestones = (
    overrides: Partial<RpcFiFormationMilestones> = {},
): RpcFiFormationMilestones => ({
    ecashSent: false,
    guardiansConfirmed: false,
    walletServiceCreated: false,
    ...overrides,
})

const makeFormation = (
    overrides: Partial<RpcFiFormationSnapshot> = {},
): RpcFiFormationSnapshot => ({
    formationId: 'formation-1',
    phase: 'preparing',
    intent: {
        federationName: 'My Wallet Service',
        federationSize: 7,
        guardianFeePpm: 0,
        plan: 'infiniteBestEffort',
        maxTotalMsats: null,
    },
    seats: [],
    freshness: 'fresh',
    actionRequired: null,
    paymentOutputsStarted: false,
    milestones: makeMilestones(),
    inviteCode: null,
    lastError: null,
    ...overrides,
})

const makePaymentRequirements = (): RpcFiPaymentRequirements => ({
    authorizationId: 'authorization-1',
    totalMsats: '21000',
    maxTotalMsats: null,
    seats: [
        {
            index: 0,
            fmanId: 'fman-0',
            fmanName: 'amber alder',
            quoteId: 'quote-0',
            paymentFederationId: 'federation-0',
            amountMsats: '21000',
        },
    ],
})

const makeActionRequired = (): RpcFiFormationActionRequired => ({
    type: 'authorizePayments',
    requirements: makePaymentRequirements(),
})

const makeReplacementRequirements =
    (): RpcFiGuardianReplacementRequirements => ({
        replacementId: 'replacement-1',
        seats: [
            {
                index: 0,
                previousFmanId: 'fman-0',
                previousFmanName: 'amber alder',
                previousQuoteId: 'quote-0',
                previousLocator: 'locator-0',
            },
        ],
    })

const makeReplacementActionRequired = (): RpcFiFormationActionRequired => ({
    type: 'replaceGuardians',
    requirements: makeReplacementRequirements(),
})

const makeReplacementPreview = (
    overrides: Partial<RpcFiReplacementPreview> = {},
): RpcFiReplacementPreview => ({
    previewId: 'replacement-preview-1',
    requirements: makeReplacementRequirements(),
    totalAdvertisedMsats: '21000',
    seats: [
        {
            index: 0,
            fmanId: 'fman-replacement-0',
            fmanName: 'brisk basalt',
            advertisedPriceMsats: '21000',
            provenance: 'registry',
        },
    ],
    ...overrides,
})

const makePreview = (
    overrides: Partial<RpcFiSelectionPreview> = {},
): RpcFiSelectionPreview => ({
    previewId: 'preview-1',
    selected: 7,
    totalAdvertisedMsats: '21000',
    seen: 12,
    eligible: 9,
    validUntil: 1754900000,
    seats: [
        {
            fmanId: 'fman-0',
            fmanName: 'amber alder',
            advertisedPriceMsats: '21000',
            provenance: 'registry',
        },
    ],
    ...overrides,
})

const makeError = (
    code: RpcFiErrorCode,
    message: string,
): RpcFiOperationError => ({ code, message, detail: null })

const buildStore = (fi: Partial<FiState> = {}) =>
    setupStore({
        fi: {
            status: null,
            clientError: null,
            creationHighWaterMark: null,
            draft: {
                name: '',
                size: RECOMMENDED_WALLET_SERVICE_SIZE,
            },
            selectionPreview: null,
            replacementPreview: null,
            eligiblePayers: null,
            payerError: null,
            liquidity: {
                operation: null,
                hasRead: false,
                errorCode: null,
                isRequesting: false,
            },
            operationError: null,
            ...fi,
        },
    })

const buildFormationStore = (overrides: Partial<RpcFiFormationSnapshot> = {}) =>
    buildStore({
        status: { type: 'formation', formation: makeFormation(overrides) },
    })

describe('common/redux/fi › reducers', () => {
    describe('setFiClientStatus', () => {
        it('should store the status and clear the client error when the client is ready', () => {
            const store = buildStore({
                clientError: makeError('storage', 'disk on fire'),
            })

            store.dispatch(
                setFiClientStatus({ type: 'ready', status: { type: 'idle' } }),
            )

            expect(store.getState().fi.status).toEqual({ type: 'idle' })
            expect(store.getState().fi.clientError).toBeNull()
        })

        it('should store the client error and leave the status alone when the client failed', () => {
            const status = {
                type: 'formation',
                formation: makeFormation(),
            } as const
            const store = buildStore({ status })
            const error = makeError('identity', 'no identity')

            store.dispatch(setFiClientStatus({ type: 'failed', error }))

            expect(store.getState().fi.clientError).toEqual(error)
            expect(store.getState().fi.status).toEqual(status)
        })
    })

    describe('setFiStatus', () => {
        it('should replace the status', () => {
            const store = buildStore({ status: { type: 'idle' } })
            const formation = makeFormation({ phase: 'acquiringSeats' })

            store.dispatch(setFiStatus({ type: 'formation', formation }))

            expect(store.getState().fi.status).toEqual({
                type: 'formation',
                formation,
            })
        })

        it('should clear the client error, since a status push proves the client is alive', () => {
            const store = buildStore({
                clientError: makeError('storage', 'disk on fire'),
            })

            store.dispatch(setFiStatus({ type: 'idle' }))

            expect(store.getState().fi.clientError).toBeNull()
        })
    })

    describe('setWalletServiceDraft', () => {
        it('should merge a partial draft into the existing draft', () => {
            const store = buildStore()

            store.dispatch(setWalletServiceDraft({ name: 'Neighborhood' }))
            store.dispatch(setWalletServiceDraft({ size: 13 }))

            expect(store.getState().fi.draft).toEqual({
                name: 'Neighborhood',
                size: 13,
            })
        })

        it('should overwrite fields that are present in the partial draft', () => {
            const store = buildStore()

            store.dispatch(setWalletServiceDraft({ size: 13 }))
            store.dispatch(setWalletServiceDraft({ size: 7 }))

            expect(store.getState().fi.draft.size).toBe(7)
        })
    })

    describe('clearFiOperationError', () => {
        it('should null out the operation error', () => {
            const store = buildStore({
                operationError: makeError('busy', 'already running'),
            })

            store.dispatch(clearFiOperationError())

            expect(store.getState().fi.operationError).toBeNull()
        })
    })
})

describe('common/redux/fi › prepareWalletServicePayment', () => {
    it('should preview the draft size on the free plan and store the result', async () => {
        const preview = makePreview()
        const payers = [{ federationId: '1', balanceMsats: '2000000' }]
        const fedimint = createMockFedimintBridge({
            fiClientPreviewSelection: () =>
                Promise.resolve({ type: 'preview', preview }),
            fiClientEligiblePayers: () =>
                Promise.resolve({ type: 'payers', payers }),
        })
        const store = setupStore()
        store.dispatch(setWalletServiceDraft({ size: 7 }))

        await store.dispatch(prepareWalletServicePayment({ fedimint })).unwrap()

        expect(fedimint.fiClientPreviewSelection).toHaveBeenCalledWith({
            federationSize: 7,
            plan: 'infiniteBestEffort',
        })
        expect(store.getState().fi.selectionPreview).toEqual(preview)
        expect(store.getState().fi.eligiblePayers).toEqual(payers)
    })

    it('should reject and store the typed error when the preview fails', async () => {
        const error = makeError('selection', 'not enough fleet managers')
        const fedimint = createMockFedimintBridge({
            fiClientPreviewSelection: () =>
                Promise.resolve({ type: 'error', error }),
            fiClientEligiblePayers: () =>
                Promise.resolve({ type: 'payers', payers: [] }),
        })
        const store = setupStore()

        await expect(
            store.dispatch(prepareWalletServicePayment({ fedimint })).unwrap(),
        ).rejects.toEqual(error)

        expect(store.getState().fi.operationError).toEqual(error)
        expect(store.getState().fi.selectionPreview).toBeNull()
    })

    // the payer lookup only says which wallet may pay. It must not take the
    // price down with it: a user in no trusted setup payment federation gets
    // an error here, and rejecting would leave them on a priceless screen
    it('should keep the preview when only the payer lookup fails', async () => {
        const error = makeError('registry', 'registry unreachable')
        const preview = makePreview()
        const fedimint = createMockFedimintBridge({
            fiClientPreviewSelection: () =>
                Promise.resolve({ type: 'preview', preview }),
            fiClientEligiblePayers: () =>
                Promise.resolve({ type: 'error', error }),
        })
        const store = setupStore()

        const result = await store
            .dispatch(prepareWalletServicePayment({ fedimint }))
            .unwrap()

        expect(result.preview).toEqual(preview)
        expect(result.payers).toEqual([])
        expect(result.payerError).toEqual(error)
        expect(store.getState().fi.selectionPreview).toEqual(preview)
        expect(store.getState().fi.payerError).toEqual(error)
        // a payer fault is not an operation fault, and the screens read them
        // from different places
        expect(store.getState().fi.operationError).toBeNull()
    })

    it('should clear a stale payer error on the next attempt', async () => {
        const error = makeError('registry', 'registry unreachable')
        const preview = makePreview()
        const payers = [{ federationId: '1', balanceMsats: '2000000' }]
        const failing = createMockFedimintBridge({
            fiClientPreviewSelection: () =>
                Promise.resolve({ type: 'preview', preview }),
            fiClientEligiblePayers: () =>
                Promise.resolve({ type: 'error', error }),
        })
        const recovering = createMockFedimintBridge({
            fiClientPreviewSelection: () =>
                Promise.resolve({ type: 'preview', preview }),
            fiClientEligiblePayers: () =>
                Promise.resolve({ type: 'payers', payers }),
        })
        const store = setupStore()

        await store
            .dispatch(prepareWalletServicePayment({ fedimint: failing }))
            .unwrap()
        expect(store.getState().fi.payerError).toEqual(error)

        await store
            .dispatch(prepareWalletServicePayment({ fedimint: recovering }))
            .unwrap()

        expect(store.getState().fi.payerError).toBeNull()
        expect(store.getState().fi.eligiblePayers).toEqual(payers)
    })
})

describe('common/redux/fi › selectWalletServicePayerAvailability', () => {
    const availabilityOf = (
        eligiblePayers: RpcFiEligiblePayer[] | null,
        payerError: RpcFiOperationError | null = null,
    ) =>
        selectWalletServicePayerAvailability(
            buildStore({ eligiblePayers, payerError }).getState(),
        )

    it('should report unknown before any quote has been fetched', () => {
        expect(availabilityOf(null)).toBe('unknown')
    })

    it('should report available when at least one wallet may pay', () => {
        expect(
            availabilityOf([{ federationId: '1', balanceMsats: '2000000' }]),
        ).toBe('available')
    })

    // an empty list is a membership the user does not have
    it('should report noTrustedFederation when the lookup returned nothing', () => {
        expect(availabilityOf([])).toBe('noTrustedFederation')
    })

    // a failed lookup leaves membership unknown, which is a different cause
    it('should report lookupFailed when the lookup itself errored', () => {
        expect(
            availabilityOf([], makeError('registry', 'registry unreachable')),
        ).toBe('lookupFailed')
    })

    // the error wins: a stale empty list must not read as "join a federation"
    it('should prefer the lookup failure over an empty payer list', () => {
        expect(
            availabilityOf(
                [{ federationId: '1', balanceMsats: '2000000' }],
                makeError('registry', 'registry unreachable'),
            ),
        ).toBe('lookupFailed')
    })
})

describe('common/redux/fi › createWalletService', () => {
    const buildPreparedStore = (preview = makePreview()) =>
        buildStore({
            draft: { name: 'Neighborhood', size: 7 },
            selectionPreview: preview,
            eligiblePayers: [{ federationId: '1', balanceMsats: '2000000' }],
        })

    it('should pay for the previewed selection with the advertised total as the limit', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientPayAndCreate: () => Promise.resolve({ type: 'success' }),
        })
        const store = buildPreparedStore()

        await store
            .dispatch(
                createWalletService({ fedimint, paymentFederationId: '1' }),
            )
            .unwrap()

        expect(fedimint.fiClientPayAndCreate).toHaveBeenCalledTimes(1)
        expect(fedimint.fiClientPayAndCreate).toHaveBeenCalledWith(
            'preview-1',
            {
                federationName: 'Neighborhood',
                federationSize: 7,
                plan: 'infiniteBestEffort',
            },
            '1',
            '21000',
        )
    })

    it('should send a null federation name when the draft name is empty', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientPayAndCreate: () => Promise.resolve({ type: 'success' }),
        })
        const store = buildStore({ selectionPreview: makePreview() })

        await store
            .dispatch(
                createWalletService({ fedimint, paymentFederationId: '1' }),
            )
            .unwrap()

        expect(
            fedimint.fiClientPayAndCreate.mock.calls[0][1].federationName,
        ).toBeNull()
    })

    it('should clear the consumed preview once the payment succeeds', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientPayAndCreate: () => Promise.resolve({ type: 'success' }),
        })
        const store = buildPreparedStore()

        await store
            .dispatch(
                createWalletService({ fedimint, paymentFederationId: '1' }),
            )
            .unwrap()

        expect(store.getState().fi.selectionPreview).toBeNull()
        expect(store.getState().fi.eligiblePayers).toBeNull()
    })

    it('should reject without calling the bridge when there is no preview to pay for', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientPayAndCreate: () => Promise.resolve({ type: 'success' }),
        })
        const store = buildStore()

        await expect(
            store
                .dispatch(
                    createWalletService({ fedimint, paymentFederationId: '1' }),
                )
                .unwrap(),
        ).rejects.toMatchObject({ code: 'selection' })

        expect(fedimint.fiClientPayAndCreate).not.toHaveBeenCalled()
    })

    it('should keep the preview on a retryable error so the user can pay again', async () => {
        const error = makeError('busy', 'operation in progress')
        const fedimint = createMockFedimintBridge({
            fiClientPayAndCreate: () =>
                Promise.resolve({ type: 'error', error }),
        })
        const store = buildPreparedStore()

        await expect(
            store
                .dispatch(
                    createWalletService({ fedimint, paymentFederationId: '1' }),
                )
                .unwrap(),
        ).rejects.toEqual(error)

        expect(store.getState().fi.operationError).toEqual(error)
        expect(store.getState().fi.selectionPreview).not.toBeNull()
    })

    it('should drop the preview when the bridge demands reauthorization', async () => {
        const error: RpcFiOperationError = {
            code: 'selectionReauthorizationRequired',
            message: 'preview expired',
            detail: {
                type: 'selectionReauthorizationRequired',
                reason: 'previewExpired',
            },
        }
        const fedimint = createMockFedimintBridge({
            fiClientPayAndCreate: () =>
                Promise.resolve({ type: 'error', error }),
        })
        const store = buildPreparedStore()

        await expect(
            store
                .dispatch(
                    createWalletService({ fedimint, paymentFederationId: '1' }),
                )
                .unwrap(),
        ).rejects.toEqual(error)

        expect(store.getState().fi.selectionPreview).toBeNull()
    })

    it('should clear a previous operation error as soon as a retry is pending', async () => {
        const failing = createMockFedimintBridge({
            fiClientPayAndCreate: () =>
                Promise.resolve({
                    type: 'error',
                    error: makeError('timeout', 'guardians never came'),
                }),
        })
        const succeeding = createMockFedimintBridge({
            fiClientPayAndCreate: () => Promise.resolve({ type: 'success' }),
        })
        const store = buildPreparedStore()
        await store.dispatch(
            createWalletService({
                fedimint: failing,
                paymentFederationId: '1',
            }),
        )
        expect(store.getState().fi.operationError).not.toBeNull()

        const retry = store.dispatch(
            createWalletService({
                fedimint: succeeding,
                paymentFederationId: '1',
            }),
        )

        // pending is dispatched synchronously, before the rpc resolves
        expect(store.getState().fi.operationError).toBeNull()
        await retry
        expect(store.getState().fi.operationError).toBeNull()
    })
})

describe('common/redux/fi › authorizeWalletServicePayments', () => {
    const AUTHORIZATION_ID = 'authorization-2:abc-DEF_123'

    it('should forward the authorization id to the bridge verbatim', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientAuthorizeReplacementPayments: () =>
                Promise.resolve({ type: 'success' }),
        })
        const store = setupStore()

        await store
            .dispatch(
                authorizeWalletServicePayments({
                    fedimint,
                    authorizationId: AUTHORIZATION_ID,
                }),
            )
            .unwrap()

        expect(
            fedimint.fiClientAuthorizeReplacementPayments,
        ).toHaveBeenCalledTimes(1)
        // the bridge rejects a stale id, so it must not be normalized on the way out
        expect(
            fedimint.fiClientAuthorizeReplacementPayments.mock.calls[0][0],
        ).toBe(AUTHORIZATION_ID)
    })

    it('should reject and store the typed error when the id is stale', async () => {
        const error = makeError('payment', 'stale authorization id')
        const fedimint = createMockFedimintBridge({
            fiClientAuthorizeReplacementPayments: () =>
                Promise.resolve({ type: 'error', error }),
        })
        const store = setupStore()

        await expect(
            store
                .dispatch(
                    authorizeWalletServicePayments({
                        fedimint,
                        authorizationId: AUTHORIZATION_ID,
                    }),
                )
                .unwrap(),
        ).rejects.toEqual(error)

        expect(store.getState().fi.operationError).toEqual(error)
    })
})

describe('common/redux/fi › resumeWalletService', () => {
    it('should call the resume rpc and leave no error behind on success', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientResume: () => Promise.resolve({ type: 'success' }),
        })
        const store = setupStore()

        await store.dispatch(resumeWalletService({ fedimint })).unwrap()

        expect(fedimint.fiClientResume).toHaveBeenCalledTimes(1)
        expect(store.getState().fi.operationError).toBeNull()
    })

    it('should store the typed error when there is nothing to resume', async () => {
        const error = makeError('noActiveFormation', 'no formation to resume')
        const fedimint = createMockFedimintBridge({
            fiClientResume: () => Promise.resolve({ type: 'error', error }),
        })
        const store = setupStore()

        await expect(
            store.dispatch(resumeWalletService({ fedimint })).unwrap(),
        ).rejects.toEqual(error)

        expect(store.getState().fi.operationError).toEqual(error)
    })
})

describe('common/redux/fi › getWalletServiceCreationStage', () => {
    it.each([
        [makeMilestones(), 1],
        [makeMilestones({ ecashSent: true }), 2],
        [makeMilestones({ ecashSent: true, guardiansConfirmed: true }), 3],
    ] as Array<[RpcFiFormationMilestones, WalletServiceCreationStage]>)(
        'should project the stage from the milestones (%o → %i)',
        (milestones, stage) => {
            expect(
                getWalletServiceCreationStage(makeFormation({ milestones })),
            ).toBe(stage)
        },
    )

    it('should trust a confirmed-guardians milestone even if ecash is not marked sent', () => {
        // milestones arrive as one snapshot, so a later milestone implies the
        // earlier ones and must not regress the display
        expect(
            getWalletServiceCreationStage(
                makeFormation({
                    milestones: makeMilestones({ guardiansConfirmed: true }),
                }),
            ),
        ).toBe(3)
    })
})

describe('common/redux/fi › selectWalletServiceCreationProgress', () => {
    it('should return null when there is no status', () => {
        const store = buildStore()

        expect(selectWalletServiceCreationProgress(store.getState())).toBeNull()
    })

    it('should return null when the client is idle', () => {
        const store = buildStore({ status: { type: 'idle' } })

        expect(selectWalletServiceCreationProgress(store.getState())).toBeNull()
    })

    it('should report an incomplete, synced formation while it is in progress', () => {
        const store = buildFormationStore({
            phase: 'acquiringSeats',
            milestones: makeMilestones({ ecashSent: true }),
        })

        expect(selectWalletServiceCreationProgress(store.getState())).toEqual({
            stage: 2,
            isComplete: false,
        })
    })

    it('should only report completion once the formation is formed', () => {
        const underway = buildFormationStore({ phase: 'dkgUnderway' })
        const formed = buildFormationStore({ phase: 'formed' })

        expect(
            selectWalletServiceCreationProgress(underway.getState())
                ?.isComplete,
        ).toBe(false)
        expect(
            selectWalletServiceCreationProgress(formed.getState())?.isComplete,
        ).toBe(true)
    })

    it('should report completion from the milestone even before the phase flips', () => {
        const store = buildFormationStore({
            phase: 'publishingSeatBindings',
            milestones: makeMilestones({
                ecashSent: true,
                guardiansConfirmed: true,
                walletServiceCreated: true,
            }),
        })

        expect(
            selectWalletServiceCreationProgress(store.getState())?.isComplete,
        ).toBe(true)
    })

    it('should not lower a stage the mark has already recorded', () => {
        // `milestones` are all() predicates over the seats, so one guardian
        // dropping out un-sets a milestone for the whole set. The screen has
        // already shown that step as done, so the reading must not fall back.
        const store = buildStore({})
        const reached = makeFormation({
            phase: 'acquiringSeats',
            milestones: makeMilestones({ ecashSent: true }),
        })
        store.dispatch(setFiStatus({ type: 'formation', formation: reached }))
        expect(
            selectWalletServiceCreationProgress(store.getState())?.stage,
        ).toBe(2)

        store.dispatch(
            setFiStatus({
                type: 'formation',
                formation: {
                    ...reached,
                    milestones: makeMilestones({ ecashSent: false }),
                },
            }),
        )

        expect(
            selectWalletServiceCreationProgress(store.getState())?.stage,
        ).toBe(2)
    })

    it('should start a genuinely new formation from the bottom again', () => {
        const store = buildStore({})
        store.dispatch(
            setFiStatus({
                type: 'formation',
                formation: makeFormation({
                    phase: 'formed',
                    milestones: makeMilestones({
                        ecashSent: true,
                        guardiansConfirmed: true,
                        walletServiceCreated: true,
                    }),
                }),
            }),
        )

        store.dispatch(
            setFiStatus({
                type: 'formation',
                formation: makeFormation({
                    formationId: 'formation-2',
                    phase: 'preparing',
                }),
            }),
        )

        expect(selectWalletServiceCreationProgress(store.getState())).toEqual({
            stage: 1,
            isComplete: false,
        })
    })
})

describe('common/redux/fi › selectCanPayForWalletService', () => {
    // the payers snapshot gates admission only; affordability reads the live
    // federation balance, so each case seeds the balance on the federation
    const buildPaymentStore = (fi: Partial<FiState>, balanceMsats = 21000) => {
        const store = buildStore(fi)
        store.dispatch(
            setFederations([
                { ...mockFederation1, balance: balanceMsats as MSats },
            ]),
        )
        store.dispatch(setPayFromFederationId(mockFederation1.id))
        return store
    }

    // the snapshot balance is deliberately zero everywhere: only the live
    // federation balance may decide affordability
    const stalePayer = {
        federationId: mockFederation1.id,
        balanceMsats: '0',
    }

    it('should allow paying when the selected wallet is eligible and covers the total', () => {
        const store = buildPaymentStore(
            {
                selectionPreview: makePreview({
                    totalAdvertisedMsats: '21000',
                }),
                eligiblePayers: [stalePayer],
            },
            21000,
        )

        expect(
            selectCanPayForWalletService(store.getState(), mockFederation1.id),
        ).toBe(true)
    })

    it('should allow paying from a top-up that lands after the payers snapshot', () => {
        // regression: the snapshot froze a zero balance, then the top-up
        // arrived as a balance event; the pay button must unlock
        const store = buildPaymentStore(
            {
                selectionPreview: makePreview({
                    totalAdvertisedMsats: '7000000',
                }),
                eligiblePayers: [stalePayer],
            },
            7000000,
        )

        expect(
            selectCanPayForWalletService(store.getState(), mockFederation1.id),
        ).toBe(true)
    })

    it('should refuse when the selected wallet is not an eligible payer', () => {
        const store = buildPaymentStore(
            {
                selectionPreview: makePreview(),
                eligiblePayers: [
                    { federationId: 'someone-else', balanceMsats: '999999999' },
                ],
            },
            999999999,
        )

        expect(
            selectCanPayForWalletService(store.getState(), mockFederation1.id),
        ).toBe(false)
    })

    it('should refuse when the live balance cannot cover the advertised total', () => {
        const store = buildPaymentStore(
            {
                selectionPreview: makePreview({
                    totalAdvertisedMsats: '21000',
                }),
                eligiblePayers: [stalePayer],
            },
            20999,
        )

        expect(
            selectCanPayForWalletService(store.getState(), mockFederation1.id),
        ).toBe(false)
    })

    it('should compare amounts beyond float precision without rounding', () => {
        // Number would round both sides to the same float and let this pass;
        // 2^53 is still exactly representable, so the balance side is exact
        const store = buildPaymentStore(
            {
                selectionPreview: makePreview({
                    totalAdvertisedMsats: '9007199254740993',
                }),
                eligiblePayers: [stalePayer],
            },
            9007199254740992,
        )

        expect(
            selectCanPayForWalletService(store.getState(), mockFederation1.id),
        ).toBe(false)
    })

    it('should refuse when no wallet is displayed as selected', () => {
        const store = buildPaymentStore(
            {
                selectionPreview: makePreview({
                    totalAdvertisedMsats: '21000',
                }),
                eligiblePayers: [stalePayer],
            },
            21000,
        )

        expect(selectCanPayForWalletService(store.getState(), undefined)).toBe(
            false,
        )
    })

    it('should refuse while the preview or the payers are missing', () => {
        const noPreview = buildPaymentStore({
            eligiblePayers: [stalePayer],
        })
        const noPayers = buildPaymentStore({
            selectionPreview: makePreview(),
        })

        expect(
            selectCanPayForWalletService(
                noPreview.getState(),
                mockFederation1.id,
            ),
        ).toBe(false)
        expect(
            selectCanPayForWalletService(
                noPayers.getState(),
                mockFederation1.id,
            ),
        ).toBe(false)
    })
})

describe('common/redux/fi › selectFiPaymentRequirements', () => {
    it('should return the requirements when payment authorization is required', () => {
        const actionRequired = makeActionRequired()
        const store = buildFormationStore({
            phase: 'acquiringSeats',
            actionRequired,
        })

        expect(selectFiPaymentRequirements(store.getState())).toEqual(
            actionRequired.requirements,
        )
    })

    it('should return the requirements for a replacement payment as well', () => {
        const actionRequired: RpcFiFormationActionRequired = {
            type: 'authorizeReplacementPayments',
            requirements: makePaymentRequirements(),
        }
        const store = buildFormationStore({
            phase: 'acquiringSeats',
            paymentOutputsStarted: true,
            actionRequired,
        })

        expect(selectFiPaymentRequirements(store.getState())).toEqual(
            actionRequired.requirements,
        )
    })

    it('should return null when no action is required', () => {
        const store = buildFormationStore({ actionRequired: null })

        expect(selectFiPaymentRequirements(store.getState())).toBeNull()
    })

    it('should return null for an action type the app does not handle', () => {
        const store = buildFormationStore({
            actionRequired: {
                type: 'replaceGuardians',
            } as unknown as RpcFiFormationActionRequired,
        })

        expect(selectFiPaymentRequirements(store.getState())).toBeNull()
    })

    it('should return null when there is no formation', () => {
        const store = buildStore({ status: { type: 'idle' } })

        expect(selectFiPaymentRequirements(store.getState())).toBeNull()
    })
})

describe('common/redux/fi › selectWalletServiceFlowStatus', () => {
    it('should report unknown until the first status has loaded', () => {
        const store = buildStore({ status: null })

        expect(selectWalletServiceFlowStatus(store.getState())).toBe('unknown')
    })

    it('should report none when there is no formation', () => {
        const store = buildStore({ status: { type: 'idle' } })

        expect(selectWalletServiceFlowStatus(store.getState())).toBe('none')
    })

    it('should report inProgress even while an authorization is parked', () => {
        // a parked payment is handled on the progress screen, not by
        // re-entering the confirm flow
        const store = buildFormationStore({
            phase: 'acquiringSeats',
            actionRequired: makeActionRequired(),
        })

        expect(selectWalletServiceFlowStatus(store.getState())).toBe(
            'inProgress',
        )
    })

    it('should report inProgress when the formation needs no user action', () => {
        const store = buildFormationStore({ phase: 'dkgUnderway' })

        expect(selectWalletServiceFlowStatus(store.getState())).toBe(
            'inProgress',
        )
    })

    it('should report formed even if an action is still parked on the snapshot', () => {
        const store = buildFormationStore({
            phase: 'formed',
            actionRequired: makeActionRequired(),
        })

        expect(selectWalletServiceFlowStatus(store.getState())).toBe('formed')
    })
})

describe('common/redux/fi › getWalletServiceErrorKey', () => {
    it.each([
        ['busy', 'feature.wallet-service.error-busy'],
        [
            'capabilityUnavailable',
            'feature.wallet-service.error-capability-unavailable',
        ],
        ['fleetManager', 'feature.wallet-service.error-fleet-manager'],
        [
            'invalidFleetManagers',
            'feature.wallet-service.error-invalid-fleet-managers',
        ],
        ['invalidIntent', 'feature.wallet-service.error-invalid-intent'],
        ['invalidOptions', 'feature.wallet-service.error-invalid-options'],
        [
            'noActiveFormation',
            'feature.wallet-service.error-no-active-formation',
        ],
        ['payment', 'feature.wallet-service.error-payment'],
        [
            'pushNotifications',
            'feature.wallet-service.error-push-notifications',
        ],
        ['liquidity', 'feature.wallet-service.error-liquidity'],
        [
            'abandonUnavailable',
            'feature.wallet-service.error-abandon-unavailable',
        ],
        [
            'maintenanceWrongState',
            'feature.wallet-service.error-maintenance-wrong-state',
        ],
        [
            'maintenanceRejected',
            'feature.wallet-service.error-maintenance-rejected',
        ],
        [
            'maintenanceConsensusTooLarge',
            'feature.wallet-service.error-maintenance-too-large',
        ],
        [
            'maintenanceConsensusInvalid',
            'feature.wallet-service.error-maintenance-invalid',
        ],
        [
            'maintenanceConvergence',
            'feature.wallet-service.error-maintenance-timeout',
        ],
        ['registry', 'feature.wallet-service.error-registry'],
        ['selection', 'feature.wallet-service.error-selection'],
        [
            'selectionReauthorizationRequired',
            'feature.wallet-service.error-selection-changed',
        ],
        ['timeout', 'feature.wallet-service.error-timeout'],
    ] as Array<[RpcFiErrorCode, string]>)(
        'should map the %s code to %s',
        (code, key) => {
            expect(getWalletServiceErrorKey(code)).toBe(key)
        },
    )

    it('should fall back to the generic error for a code with no message of its own', () => {
        expect(getWalletServiceErrorKey('storage')).toBe(
            'feature.wallet-service.error-generic',
        )
    })

    it('should fall back to the generic error for a code the bindings do not know', () => {
        expect(
            getWalletServiceErrorKey('quantumDecoherence' as RpcFiErrorCode),
        ).toBe('feature.wallet-service.error-generic')
    })

    it.each([[null], [undefined]])(
        'should fall back to the generic error for %p',
        code => {
            expect(getWalletServiceErrorKey(code)).toBe(
                'feature.wallet-service.error-generic',
            )
        },
    )
})

describe('common/redux/fi › previewWalletServiceReplacements', () => {
    it('should store the preview on success', async () => {
        const preview = makeReplacementPreview()
        const fedimint = createMockFedimintBridge({
            fiClientPreviewReplacements: () =>
                Promise.resolve({ type: 'preview', preview }),
        })
        const store = setupStore()

        await store
            .dispatch(previewWalletServiceReplacements({ fedimint }))
            .unwrap()

        expect(store.getState().fi.replacementPreview).toEqual(preview)
    })

    it('should clear any stale preview and store the typed error on failure', async () => {
        const error = makeError(
            'selection',
            'not enough fleet managers to replace',
        )
        const fedimint = createMockFedimintBridge({
            fiClientPreviewReplacements: () =>
                Promise.resolve({ type: 'error', error }),
        })
        const store = buildStore({
            replacementPreview: makeReplacementPreview(),
        })

        await expect(
            store
                .dispatch(previewWalletServiceReplacements({ fedimint }))
                .unwrap(),
        ).rejects.toEqual(error)

        expect(store.getState().fi.replacementPreview).toBeNull()
        expect(store.getState().fi.operationError).toEqual(error)
    })
})

describe('common/redux/fi › applyWalletServiceReplacements', () => {
    it('should forward the previewId and total to the bridge and clear the preview on success', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientApplyReplacements: () =>
                Promise.resolve({ type: 'success' }),
        })
        const store = buildStore({
            replacementPreview: makeReplacementPreview(),
        })

        await store
            .dispatch(
                applyWalletServiceReplacements({
                    fedimint,
                    previewId: 'replacement-preview-1',
                    maxTotalMsats: '21000',
                }),
            )
            .unwrap()

        expect(fedimint.fiClientApplyReplacements).toHaveBeenCalledWith(
            'replacement-preview-1',
            '21000',
        )
        expect(store.getState().fi.replacementPreview).toBeNull()
    })

    it('should also clear the preview when the apply is rejected, forcing a fresh preview', async () => {
        const error = makeError('selection', 'subset already applied')
        const fedimint = createMockFedimintBridge({
            fiClientApplyReplacements: () =>
                Promise.resolve({ type: 'error', error }),
        })
        const store = buildStore({
            replacementPreview: makeReplacementPreview(),
        })

        await expect(
            store
                .dispatch(
                    applyWalletServiceReplacements({
                        fedimint,
                        previewId: 'replacement-preview-1',
                        maxTotalMsats: '21000',
                    }),
                )
                .unwrap(),
        ).rejects.toEqual(error)

        expect(store.getState().fi.replacementPreview).toBeNull()
        expect(store.getState().fi.operationError).toEqual(error)
    })
})

describe('common/redux/fi › selectFiReplacementRequirements', () => {
    it('should return the requirements when a guardian replacement is parked', () => {
        const actionRequired = makeReplacementActionRequired()
        const store = buildFormationStore({ actionRequired })

        expect(selectFiReplacementRequirements(store.getState())).toEqual(
            actionRequired.requirements,
        )
    })

    it('should return null for a payment action, since that is a different prompt', () => {
        const store = buildFormationStore({
            actionRequired: makeActionRequired(),
        })

        expect(selectFiReplacementRequirements(store.getState())).toBeNull()
    })

    it('should return null when no action is required', () => {
        const store = buildFormationStore({ actionRequired: null })

        expect(selectFiReplacementRequirements(store.getState())).toBeNull()
    })
})

describe('common/redux/fi › selectWalletServiceReplacementPreview', () => {
    it('should read the process-local preview straight off state', () => {
        const preview = makeReplacementPreview()
        const store = buildStore({ replacementPreview: preview })

        expect(selectWalletServiceReplacementPreview(store.getState())).toBe(
            preview,
        )
    })

    it('should return null when there is no preview', () => {
        const store = buildStore()

        expect(
            selectWalletServiceReplacementPreview(store.getState()),
        ).toBeNull()
    })
})

describe('common/redux/fi › selectWalletServiceGuardianProgress', () => {
    it('should return null when there is no formation', () => {
        const store = buildStore({ status: { type: 'idle' } })

        expect(selectWalletServiceGuardianProgress(store.getState())).toBeNull()
    })

    it('should return null while no seats have been selected yet', () => {
        const store = buildFormationStore({ seats: [] })

        expect(selectWalletServiceGuardianProgress(store.getState())).toBeNull()
    })

    it('should count only seats past guardianCodeReady as confirmed', () => {
        const store = buildFormationStore({
            seats: [
                // null FMan identity throughout: these seats are here for their
                // phases, and a pinned FMan really does report null for both.
                {
                    index: 0,
                    fmanId: null,
                    fmanName: null,
                    locator: 'locator-0',
                    seatId: 'seat-0',
                    guardianCode: 'code-0',
                    phase: 'guardianCodeReady',
                    freshness: 'fresh',
                },
                {
                    index: 1,
                    fmanId: null,
                    fmanName: null,
                    locator: 'locator-1',
                    seatId: 'seat-1',
                    guardianCode: null,
                    phase: 'dkgUnderway',
                    freshness: 'fresh',
                },
                {
                    index: 2,
                    fmanId: null,
                    fmanName: null,
                    locator: 'locator-2',
                    seatId: 'seat-2',
                    guardianCode: null,
                    phase: 'running',
                    freshness: 'fresh',
                },
                {
                    index: 3,
                    fmanId: null,
                    fmanName: null,
                    locator: 'locator-3',
                    seatId: null,
                    guardianCode: null,
                    phase: 'acquiring',
                    freshness: 'fresh',
                },
            ],
        })

        expect(selectWalletServiceGuardianProgress(store.getState())).toEqual({
            confirmed: 3,
            total: 4,
        })
    })
})

describe('common/redux/fi › selectWalletServicePaymentShortfall', () => {
    const buildShortfallStore = (
        requirements: RpcFiPaymentRequirements,
        balances: Record<string, number>,
    ) => {
        const store = buildFormationStore({
            actionRequired: { type: 'authorizePayments', requirements },
        })
        store.dispatch(
            setFederations(
                Object.entries(balances).map(([id, balance]) => ({
                    ...mockFederation1,
                    id,
                    balance: balance as MSats,
                })),
            ),
        )
        return store
    }

    it('should return null when there is nothing parked to pay for', () => {
        const store = buildFormationStore({ actionRequired: null })

        expect(selectWalletServicePaymentShortfall(store.getState())).toBeNull()
    })

    it('should return null once every payer federation covers its grouped total', () => {
        const requirements: RpcFiPaymentRequirements = {
            authorizationId: 'authorization-covered',
            totalMsats: '21000',
            maxTotalMsats: null,
            seats: [
                {
                    index: 0,
                    fmanId: null,
                    fmanName: null,
                    quoteId: 'quote-0',
                    paymentFederationId: 'federation-a',
                    amountMsats: '21000',
                },
            ],
        }
        const store = buildShortfallStore(requirements, {
            'federation-a': 21000,
        })

        expect(selectWalletServicePaymentShortfall(store.getState())).toBeNull()
    })

    it('should sum multiple seats owed to the same payer before comparing', () => {
        const requirements: RpcFiPaymentRequirements = {
            authorizationId: 'authorization-summed',
            totalMsats: '42000',
            maxTotalMsats: null,
            seats: [
                {
                    index: 0,
                    fmanId: null,
                    fmanName: null,
                    quoteId: 'quote-0',
                    paymentFederationId: 'federation-a',
                    amountMsats: '21000',
                },
                {
                    index: 1,
                    fmanId: null,
                    fmanName: null,
                    quoteId: 'quote-1',
                    paymentFederationId: 'federation-a',
                    amountMsats: '21000',
                },
            ],
        }
        // covers one seat's worth but not both combined
        const store = buildShortfallStore(requirements, {
            'federation-a': 21000,
        })

        expect(selectWalletServicePaymentShortfall(store.getState())).toEqual({
            federationId: 'federation-a',
            shortfallMsats: BigInt(21000),
            requiredMsats: BigInt(42000),
        })
    })

    it('should report the first payer with a shortfall, not just any of them', () => {
        const requirements: RpcFiPaymentRequirements = {
            authorizationId: 'authorization-first-shortfall',
            totalMsats: '42000',
            maxTotalMsats: null,
            seats: [
                {
                    index: 0,
                    fmanId: null,
                    fmanName: null,
                    quoteId: 'quote-0',
                    paymentFederationId: 'federation-a',
                    amountMsats: '21000',
                },
                {
                    index: 1,
                    fmanId: null,
                    fmanName: null,
                    quoteId: 'quote-1',
                    paymentFederationId: 'federation-b',
                    amountMsats: '21000',
                },
            ],
        }
        const store = buildShortfallStore(requirements, {
            'federation-a': 21000,
            'federation-b': 0,
        })

        expect(selectWalletServicePaymentShortfall(store.getState())).toEqual({
            federationId: 'federation-b',
            shortfallMsats: BigInt(21000),
            requiredMsats: BigInt(21000),
        })
    })

    it('should return the same object reference across unrelated state changes', () => {
        const requirements: RpcFiPaymentRequirements = {
            authorizationId: 'authorization-referential-stable',
            totalMsats: '21000',
            maxTotalMsats: null,
            seats: [
                {
                    index: 0,
                    fmanId: null,
                    fmanName: null,
                    quoteId: 'quote-0',
                    paymentFederationId: 'federation-a',
                    amountMsats: '21000',
                },
            ],
        }
        const store = buildShortfallStore(requirements, {
            'federation-a': 1000,
        })

        const first = selectWalletServicePaymentShortfall(store.getState())
        // unrelated dispatch: touches neither the requirements nor any
        // balance the shortfall depends on
        store.dispatch(setWalletServiceDraft({ name: 'unrelated change' }))
        const second = selectWalletServicePaymentShortfall(store.getState())

        expect(second).toBe(first)
    })

    it('should return a fresh object once a relevant balance changes', () => {
        const requirements: RpcFiPaymentRequirements = {
            authorizationId: 'authorization-referential-fresh',
            totalMsats: '21000',
            maxTotalMsats: null,
            seats: [
                {
                    index: 0,
                    fmanId: null,
                    fmanName: null,
                    quoteId: 'quote-0',
                    paymentFederationId: 'federation-a',
                    amountMsats: '21000',
                },
            ],
        }
        const store = buildShortfallStore(requirements, {
            'federation-a': 1000,
        })

        const first = selectWalletServicePaymentShortfall(store.getState())
        store.dispatch(
            setFederations([
                {
                    ...mockFederation1,
                    id: 'federation-a',
                    balance: 2000 as MSats,
                },
            ]),
        )
        const second = selectWalletServicePaymentShortfall(store.getState())

        expect(second).not.toBe(first)
        expect(second).toEqual({
            federationId: 'federation-a',
            shortfallMsats: BigInt(19000),
            requiredMsats: BigInt(21000),
        })
    })
})

describe('common/redux/fi › isTerminalWalletServiceError', () => {
    it.each(['invalidIntent', 'invalidOptions', 'abandonUnavailable'] as const)(
        'should treat %s as terminal, since retrying cannot fix it',
        code => {
            expect(isTerminalWalletServiceError(code)).toBe(true)
        },
    )

    it.each(['busy', 'timeout', 'registry', 'payment'] as const)(
        'should treat %s as retryable, not terminal',
        code => {
            expect(isTerminalWalletServiceError(code)).toBe(false)
        },
    )

    it.each([[null], [undefined]])('should treat %p as not terminal', code => {
        expect(isTerminalWalletServiceError(code)).toBe(false)
    })
})

describe('common/redux/fi › describeFiClientStatusChange', () => {
    const readyIdle = { type: 'ready', status: { type: 'idle' } } as const

    const makeReady = (overrides: Partial<RpcFiFormationSnapshot> = {}) =>
        ({
            type: 'ready',
            status: { type: 'formation', formation: makeFormation(overrides) },
        }) as const

    const makeSeat = (
        index: number,
        phase: RpcFiSeatProgress['phase'],
    ): RpcFiSeatProgress => ({
        index,
        fmanId: `fman-${index}`,
        fmanName: 'two words',
        locator: `locator-${index}`,
        seatId: null,
        guardianCode: null,
        phase,
        freshness: 'fresh',
    })

    it('should describe the first status it sees, since there is nothing to compare against', () => {
        const change = describeFiClientStatusChange(null, readyIdle)

        expect(change).toEqual({
            level: 'info',
            message: 'fi client status',
            fields: { state: 'idle' },
        })
    })

    it('should stay quiet when the bridge re-reports the same formation', () => {
        const status = makeReady({ phase: 'acquiringSeats' })

        expect(describeFiClientStatusChange(status, status)).toBeNull()
    })

    it('should report a phase change', () => {
        const change = describeFiClientStatusChange(
            makeReady({ phase: 'acquiringSeats' }),
            makeReady({ phase: 'preparingDkg' }),
        )

        expect(change?.level).toBe('info')
        expect(change?.fields).toMatchObject({
            state: 'formation',
            formationId: 'formation-1',
            phase: 'preparingDkg',
        })
    })

    it('should report a freshness change, since it is what un-sets milestones already shown', () => {
        const change = describeFiClientStatusChange(
            makeReady({ freshness: 'fresh' }),
            makeReady({ freshness: 'unsynced' }),
        )

        expect(change?.fields).toMatchObject({ freshness: 'unsynced' })
    })

    it('should count seats by phase rather than listing every seat', () => {
        const change = describeFiClientStatusChange(
            null,
            makeReady({
                seats: [
                    makeSeat(0, 'acquiring'),
                    makeSeat(1, 'acquiring'),
                    makeSeat(2, 'created'),
                ],
            }),
        )

        expect(change?.fields).toMatchObject({
            seats: { acquiring: 2, created: 1 },
        })
    })

    it('should report a seat tally change even when the formation phase holds still', () => {
        const change = describeFiClientStatusChange(
            makeReady({ seats: [makeSeat(0, 'acquiring')] }),
            makeReady({ seats: [makeSeat(0, 'created')] }),
        )

        expect(change?.fields).toMatchObject({ seats: { created: 1 } })
    })

    it('should report the action required by type only', () => {
        const change = describeFiClientStatusChange(
            null,
            makeReady({ actionRequired: makeActionRequired() }),
        )

        expect(change?.fields).toMatchObject({
            actionRequired: 'authorizePayments',
        })
    })

    it('should report a null action required rather than omitting the field', () => {
        const change = describeFiClientStatusChange(null, makeReady())

        expect(change?.fields).toMatchObject({ actionRequired: null })
    })

    it('should report whether an invite code has arrived without writing the code itself', () => {
        const change = describeFiClientStatusChange(
            makeReady({ inviteCode: null }),
            makeReady({ inviteCode: 'fed11-a-very-long-invite-code' }),
        )

        expect(change?.fields).toMatchObject({ hasInviteCode: true })
        expect(JSON.stringify(change?.fields)).not.toContain('fed11')
    })

    it('should raise a formation carrying a lastError to warn', () => {
        const change = describeFiClientStatusChange(
            makeReady(),
            makeReady({ lastError: 'registry' }),
        )

        expect(change?.level).toBe('warn')
        expect(change?.fields).toMatchObject({ lastError: 'registry' })
    })

    it('should report a failed client at error, since no layer underneath records it', () => {
        const change = describeFiClientStatusChange(readyIdle, {
            type: 'failed',
            error: makeError('identity', 'no identity'),
        })

        expect(change).toEqual({
            level: 'error',
            message: 'fi client status',
            fields: {
                state: 'failed',
                errorCode: 'identity',
                errorMessage: 'no identity',
            },
        })
    })

    it('should stay quiet when the same failure is re-reported', () => {
        const failed = {
            type: 'failed',
            error: makeError('identity', 'no identity'),
        } as const

        expect(describeFiClientStatusChange(failed, failed)).toBeNull()
    })

    it('should report a different failure code after a failure', () => {
        const change = describeFiClientStatusChange(
            { type: 'failed', error: makeError('identity', 'no identity') },
            { type: 'failed', error: makeError('storage', 'disk on fire') },
        )

        expect(change?.fields).toMatchObject({ errorCode: 'storage' })
    })

    it('should report recovery from a failure back to a live status', () => {
        const change = describeFiClientStatusChange(
            { type: 'failed', error: makeError('identity', 'no identity') },
            readyIdle,
        )

        expect(change).toMatchObject({
            level: 'info',
            fields: { state: 'idle' },
        })
    })
})
