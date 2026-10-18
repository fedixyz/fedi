import type { bindings } from '../../../types'
import { BridgeError } from '../../../utils/errors'
import { FedimintBridge } from '../../../utils/fedimint'

describe('FedimintBridge FA client', () => {
    test('forwards only the verified selected formation flow through typed RPCs', async () => {
        const clientStatus: bindings.RpcFaClientStatus = {
            type: 'ready',
            status: { type: 'idle' },
        }
        const eligiblePayers: bindings.RpcFaEligiblePayersResult = {
            type: 'payers',
            payers: [{ federationId: 'payer', balanceMsats: '0' }],
        }
        const preview: bindings.RpcFaSelectionPreviewResult = {
            type: 'preview',
            preview: {
                previewId: 'preview',
                selected: 7,
                totalAdvertisedMsats: '70000',
                seen: 8,
                eligible: 7,
                validUntil: 100,
                seats: [],
            },
        }
        const operationResult: bindings.RpcFaOperationResult = {
            type: 'success',
        }
        const replacementPreview: bindings.RpcFaReplacementPreviewResult = {
            type: 'preview',
            preview: {
                previewId: 'replacement-preview',
                requirements: {
                    replacementId: 'replacement-action',
                    seats: [
                        {
                            index: 2,
                            previousQuoteId: 'old-quote',
                            previousLocator: '{}',
                            previousMgId: null,
                            previousMgName: null,
                        },
                    ],
                },
                totalAdvertisedMsats: '12000',
                seats: [],
            },
        }
        const rpc = jest
            .fn()
            .mockResolvedValueOnce(clientStatus)
            .mockResolvedValueOnce(eligiblePayers)
            .mockResolvedValueOnce(preview)
            .mockResolvedValueOnce(operationResult)
            .mockResolvedValueOnce(replacementPreview)
            .mockResolvedValue(operationResult)
        const fedimint = new FedimintBridge(rpc)
        const intent: bindings.RpcFaFormationIntent = {
            federationName: 'My federation',
            federationSize: 7,
            plan: 'infiniteBestEffort',
        }
        const request: bindings.RpcFaSelectionPreviewRequest = {
            federationSize: 7,
            plan: 'infiniteBestEffort',
        }

        await expect(fedimint.faClientStatus()).resolves.toEqual(clientStatus)
        await expect(fedimint.faClientEligiblePayers()).resolves.toEqual(
            eligiblePayers,
        )
        await expect(
            fedimint.faClientPreviewSelection(request),
        ).resolves.toEqual(preview)
        await expect(
            fedimint.faClientPayAndCreate('preview', intent, 'payer', '70000'),
        ).resolves.toEqual(operationResult)
        await expect(fedimint.faClientPreviewReplacements()).resolves.toEqual(
            replacementPreview,
        )
        await expect(
            fedimint.faClientApplyReplacements('replacement-preview', '12000'),
        ).resolves.toEqual(operationResult)
        await expect(
            fedimint.faClientAuthorizeReplacementPayments(
                'exact-replacement-quotes',
            ),
        ).resolves.toEqual(operationResult)
        await expect(fedimint.faClientResume()).resolves.toEqual(
            operationResult,
        )
        await expect(fedimint.faClientAbandon()).resolves.toEqual(
            operationResult,
        )
        await expect(fedimint.faClientScheduleReset()).resolves.toEqual(
            operationResult,
        )

        expect(rpc).toHaveBeenNthCalledWith(1, 'faClientStatus', {})
        expect(rpc).toHaveBeenNthCalledWith(2, 'faClientEligiblePayers', {})
        expect(rpc).toHaveBeenNthCalledWith(3, 'faClientPreviewSelection', {
            request,
        })
        expect(rpc).toHaveBeenNthCalledWith(4, 'faClientPayAndCreate', {
            previewId: 'preview',
            intent,
            paymentFederationId: 'payer',
            maxTotalMsats: '70000',
        })
        expect(rpc).toHaveBeenNthCalledWith(
            5,
            'faClientPreviewReplacements',
            {},
        )
        expect(rpc).toHaveBeenNthCalledWith(6, 'faClientApplyReplacements', {
            previewId: 'replacement-preview',
            maxTotalMsats: '12000',
        })
        expect(rpc).toHaveBeenNthCalledWith(
            7,
            'faClientAuthorizeReplacementPayments',
            { authorizationId: 'exact-replacement-quotes' },
        )
        expect(rpc).toHaveBeenNthCalledWith(8, 'faClientResume', {})
        expect(rpc).toHaveBeenNthCalledWith(9, 'faClientAbandon', {})
        expect(rpc).toHaveBeenNthCalledWith(10, 'faClientScheduleReset', {})
        expect(
            (fedimint as unknown as Record<string, unknown>)
                .faClientCreatePinned,
        ).toBeUndefined()
        expect(
            (fedimint as unknown as Record<string, unknown>)
                .faClientAuthorizePayments,
        ).toBeUndefined()
    })

    test('forwards post-formation liquidity and bounded recovery RPCs', async () => {
        const intent: bindings.RpcFaLiquidityRequestIntent = {
            amounts: {
                gatewayMinSats: 10,
                gatewayMaxSats: 50_000,
                stabilityMinSats: 0,
                stabilityMaxSats: null,
            },
            approvedProviderPubkeys: ['provider'],
        }
        const discovery: bindings.RpcFaLiquidityDiscoveryResult = {
            type: 'discovery',
            providers: [],
            rejected: [],
        }
        const operation: bindings.RpcFaLiquidityOperation = {
            operationId: 'operation',
            formationId: 'formation',
            providerPubkey: 'provider',
            endpointHint: 'iroh://provider',
            detailsPayloadHash: '00'.repeat(32),
            amounts: intent.amounts,
            phase: 'prepared',
            itemStatuses: [],
            rejectionCode: null,
            gatewayViewVerified: false,
        }
        const operationResult: bindings.RpcFaLiquidityOperationResult = {
            type: 'operation',
            operation,
        }
        const pageResult: bindings.RpcFaLiquidityOperationPageResult = {
            type: 'page',
            page: {
                operations: [operation],
                nextAfter: 'next-operation',
            },
        }
        const currentResult: bindings.RpcFaCurrentLiquidityOperationResult = {
            type: 'current',
            operation,
        }
        const rpc = jest
            .fn()
            .mockResolvedValueOnce(discovery)
            .mockResolvedValueOnce(operationResult)
            .mockResolvedValueOnce(operationResult)
            .mockResolvedValueOnce(operationResult)
            .mockResolvedValueOnce(currentResult)
            .mockResolvedValueOnce(pageResult)
        const fedimint = new FedimintBridge(rpc)

        await expect(
            fedimint.faClientLiquidityDiscover(intent, 'regtest'),
        ).resolves.toEqual(discovery)
        await expect(
            fedimint.faClientLiquidityStart('formation', 'provider', intent),
        ).resolves.toEqual(operationResult)
        await expect(
            fedimint.faClientLiquidityResume('operation'),
        ).resolves.toEqual(operationResult)
        await expect(
            fedimint.faClientLiquidityStatus('operation'),
        ).resolves.toEqual(operationResult)
        await expect(fedimint.faClientLiquidityCurrent()).resolves.toEqual(
            currentResult,
        )
        await expect(
            fedimint.faClientLiquidityList('next-after'),
        ).resolves.toEqual(pageResult)

        expect(rpc.mock.calls).toEqual([
            ['faClientLiquidityDiscover', { intent, network: 'regtest' }],
            [
                'faClientLiquidityStart',
                {
                    formationId: 'formation',
                    providerPubkey: 'provider',
                    intent,
                },
            ],
            ['faClientLiquidityResume', { operationId: 'operation' }],
            ['faClientLiquidityStatus', { operationId: 'operation' }],
            ['faClientLiquidityCurrent', {}],
            ['faClientLiquidityList', { after: 'next-after' }],
        ])
    })

    test('forwards post-formation maintenance only through typed RPCs', async () => {
        const operationResult: bindings.RpcFaOperationResult = {
            type: 'success',
        }
        const rpc = jest.fn().mockResolvedValue(operationResult)
        const fedimint = new FedimintBridge(rpc)
        const update: bindings.RpcFaFederationMetadataUpdate = {
            type: 'welcomeMessage',
            value: 'Welcome members',
        }

        await expect(
            fedimint.faClientUpdateFederationMetadata(update),
        ).resolves.toEqual(operationResult)
        await expect(fedimint.faClientSetGuardianFee(5_000)).resolves.toEqual(
            operationResult,
        )

        expect(rpc).toHaveBeenNthCalledWith(
            1,
            'faClientUpdateFederationMetadata',
            { update },
        )
        expect(rpc).toHaveBeenNthCalledWith(2, 'faClientSetGuardianFee', {
            guardianFeePpm: 5_000,
        })
    })

    test('exposes typed status updates and cancels the private RPC stream', async () => {
        const rpc = jest.fn().mockResolvedValue(undefined)
        const fedimint = new FedimintBridge(rpc)
        const callback = jest.fn()
        const status: bindings.RpcFaClientStatus = {
            type: 'ready',
            status: {
                type: 'formation',
                formation: {
                    formationId: 'formation-current',
                    phase: 'dkgUnderway',
                    intent: {
                        federationName: 'Current Federation',
                        federationSize: 7,
                        guardianFeePpm: 0,
                        plan: 'infiniteBestEffort',
                        maxTotalMsats: '9007199254740993',
                    },
                    seats: [],
                    freshness: 'unsynced',
                    actionRequired: null,
                    paymentOutputsStarted: false,
                    milestones: {
                        ecashSent: false,
                        guardiansConfirmed: false,
                        walletServiceCreated: false,
                    },
                    inviteCode: null,
                    lastError: null,
                },
            },
        }

        const unsubscribe = fedimint.faClientSubscribe({ callback })

        expect(typeof unsubscribe).toBe('function')
        expect(rpc).toHaveBeenCalledWith('faClientSubscribe', { streamId: 0 })

        fedimint.emit('streamUpdate', {
            stream_id: 0,
            sequence: 0,
            data: status,
        })
        expect(callback).toHaveBeenCalledWith(status)

        unsubscribe()
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(rpc).toHaveBeenCalledWith('streamCancel', { streamId: 0 })

        fedimint.emit('streamUpdate', {
            stream_id: 0,
            sequence: 1,
            data: status,
        })
        expect(callback).toHaveBeenCalledTimes(1)
    })

    test('reports stream registration failure and removes the handler', async () => {
        const error = new BridgeError({
            errorCode: null,
            error: 'registration failed',
            detail: 'registration failed',
        })
        const rpc = jest.fn().mockRejectedValue(error)
        const fedimint = new FedimintBridge(rpc)
        const callback = jest.fn()
        const onError = jest.fn()

        fedimint.faClientSubscribe({ callback, onError })
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(onError).toHaveBeenCalledWith(error)
        fedimint.emit('streamUpdate', {
            stream_id: 0,
            sequence: 0,
            data: { type: 'ready', status: { type: 'idle' } },
        })
        expect(callback).not.toHaveBeenCalled()
        expect(rpc).toHaveBeenCalledTimes(1)
    })

    test('forwards the native push installation lifecycle with typed payloads', async () => {
        const registered: bindings.RpcFaPushRegistrationResult = {
            type: 'registered',
            installationId: 'phone:mobile:installation',
        }
        const unregistered: bindings.RpcFaPushRegistrationResult = {
            type: 'unregistered',
            installationId: 'phone:mobile:installation',
        }
        const rpc = jest
            .fn()
            .mockResolvedValueOnce(registered)
            .mockResolvedValueOnce(unregistered)
        const fedimint = new FedimintBridge(rpc)

        await expect(
            fedimint.faClientRegisterPushInstallation(
                'fcm-registration-token',
                'android',
            ),
        ).resolves.toEqual(registered)
        await expect(
            fedimint.faClientUnregisterPushInstallation(),
        ).resolves.toEqual(unregistered)

        expect(rpc).toHaveBeenNthCalledWith(
            1,
            'faClientRegisterPushInstallation',
            {
                fcmToken: 'fcm-registration-token',
                platform: 'android',
            },
        )
        expect(rpc).toHaveBeenNthCalledWith(
            2,
            'faClientUnregisterPushInstallation',
            {},
        )
    })

    test('forwards the Manifold environment selection through typed RPCs', async () => {
        const rpc = jest
            .fn()
            .mockResolvedValueOnce('Staging')
            .mockResolvedValue(null)
        const fedimint = new FedimintBridge(rpc)

        await expect(fedimint.getFaManifoldEnvironment()).resolves.toEqual(
            'Staging',
        )
        await expect(
            fedimint.setFaManifoldEnvironment('Production'),
        ).resolves.toBeNull()

        expect(rpc).toHaveBeenNthCalledWith(1, 'getFaManifoldEnvironment', {})
        expect(rpc).toHaveBeenNthCalledWith(2, 'setFaManifoldEnvironment', {
            environment: 'Production',
        })
    })

    test('forwards the seat decommission and reports every seat outcome', async () => {
        const outcome: bindings.RpcFaDecommissionResult = {
            type: 'outcome',
            decommissioned: [0, 1],
            alreadyDecommissioned: [2],
            refused: [{ index: 3, reason: 'decommission request timed out' }],
        }
        const rpc = jest.fn().mockResolvedValue(outcome)
        const fedimint = new FedimintBridge(rpc)

        await expect(fedimint.faClientDecommission()).resolves.toEqual(outcome)

        expect(rpc).toHaveBeenNthCalledWith(1, 'faClientDecommission', {})
    })
})
