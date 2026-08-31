import type { bindings } from '../../../types'
import { BridgeError } from '../../../utils/errors'
import { FedimintBridge } from '../../../utils/fedimint'

describe('FedimintBridge FI client', () => {
    test('forwards only the verified selected formation flow through typed RPCs', async () => {
        const clientStatus: bindings.RpcFiClientStatus = {
            type: 'ready',
            status: { type: 'idle' },
        }
        const eligiblePayers: bindings.RpcFiEligiblePayersResult = {
            type: 'payers',
            payers: [{ federationId: 'payer', balanceMsats: '0' }],
        }
        const preview: bindings.RpcFiSelectionPreviewResult = {
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
        const operationResult: bindings.RpcFiOperationResult = {
            type: 'success',
        }
        const replacementPreview: bindings.RpcFiReplacementPreviewResult = {
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
                            previousFmanId: null,
                            previousFmanName: null,
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
        const intent: bindings.RpcFiFormationIntent = {
            federationName: 'My federation',
            federationSize: 7,
            plan: 'infiniteBestEffort',
            fedimintdVersion: '0.11.1',
        }
        const request: bindings.RpcFiSelectionPreviewRequest = {
            federationSize: 7,
            plan: 'infiniteBestEffort',
            fedimintdVersion: '0.11.1',
        }

        await expect(fedimint.fiClientStatus()).resolves.toEqual(clientStatus)
        await expect(fedimint.fiClientEligiblePayers()).resolves.toEqual(
            eligiblePayers,
        )
        await expect(
            fedimint.fiClientPreviewSelection(request),
        ).resolves.toEqual(preview)
        await expect(
            fedimint.fiClientPayAndCreate('preview', intent, 'payer', '70000'),
        ).resolves.toEqual(operationResult)
        await expect(fedimint.fiClientPreviewReplacements()).resolves.toEqual(
            replacementPreview,
        )
        await expect(
            fedimint.fiClientApplyReplacements('replacement-preview', '12000'),
        ).resolves.toEqual(operationResult)
        await expect(
            fedimint.fiClientAuthorizeReplacementPayments(
                'exact-replacement-quotes',
            ),
        ).resolves.toEqual(operationResult)
        await expect(fedimint.fiClientResume()).resolves.toEqual(
            operationResult,
        )
        await expect(fedimint.fiClientAbandon()).resolves.toEqual(
            operationResult,
        )
        await expect(fedimint.fiClientScheduleReset()).resolves.toEqual(
            operationResult,
        )

        expect(rpc).toHaveBeenNthCalledWith(1, 'fiClientStatus', {})
        expect(rpc).toHaveBeenNthCalledWith(2, 'fiClientEligiblePayers', {})
        expect(rpc).toHaveBeenNthCalledWith(3, 'fiClientPreviewSelection', {
            request,
        })
        expect(rpc).toHaveBeenNthCalledWith(4, 'fiClientPayAndCreate', {
            previewId: 'preview',
            intent,
            paymentFederationId: 'payer',
            maxTotalMsats: '70000',
        })
        expect(rpc).toHaveBeenNthCalledWith(
            5,
            'fiClientPreviewReplacements',
            {},
        )
        expect(rpc).toHaveBeenNthCalledWith(6, 'fiClientApplyReplacements', {
            previewId: 'replacement-preview',
            maxTotalMsats: '12000',
        })
        expect(rpc).toHaveBeenNthCalledWith(
            7,
            'fiClientAuthorizeReplacementPayments',
            { authorizationId: 'exact-replacement-quotes' },
        )
        expect(rpc).toHaveBeenNthCalledWith(8, 'fiClientResume', {})
        expect(rpc).toHaveBeenNthCalledWith(9, 'fiClientAbandon', {})
        expect(rpc).toHaveBeenNthCalledWith(10, 'fiClientScheduleReset', {})
        expect(
            (fedimint as unknown as Record<string, unknown>)
                .fiClientCreatePinned,
        ).toBeUndefined()
        expect(
            (fedimint as unknown as Record<string, unknown>)
                .fiClientAuthorizePayments,
        ).toBeUndefined()
    })

    test('forwards post-formation liquidity and bounded recovery RPCs', async () => {
        const intent: bindings.RpcFiLiquidityRequestIntent = {
            amounts: {
                gatewayMinSats: 10,
                gatewayMaxSats: 50_000,
                stabilityMinSats: 0,
                stabilityMaxSats: null,
            },
            approvedProviderPubkeys: ['provider'],
        }
        const discovery: bindings.RpcFiLiquidityDiscoveryResult = {
            type: 'discovery',
            providers: [],
            rejected: [],
        }
        const operation: bindings.RpcFiLiquidityOperation = {
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
        const operationResult: bindings.RpcFiLiquidityOperationResult = {
            type: 'operation',
            operation,
        }
        const pageResult: bindings.RpcFiLiquidityOperationPageResult = {
            type: 'page',
            page: {
                operations: [operation],
                nextAfter: 'next-operation',
            },
        }
        const currentResult: bindings.RpcFiCurrentLiquidityOperationResult = {
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
            fedimint.fiClientLiquidityDiscover(intent, 'regtest'),
        ).resolves.toEqual(discovery)
        await expect(
            fedimint.fiClientLiquidityStart('formation', 'provider', intent),
        ).resolves.toEqual(operationResult)
        await expect(
            fedimint.fiClientLiquidityResume('operation'),
        ).resolves.toEqual(operationResult)
        await expect(
            fedimint.fiClientLiquidityStatus('operation'),
        ).resolves.toEqual(operationResult)
        await expect(fedimint.fiClientLiquidityCurrent()).resolves.toEqual(
            currentResult,
        )
        await expect(
            fedimint.fiClientLiquidityList('next-after'),
        ).resolves.toEqual(pageResult)

        expect(rpc.mock.calls).toEqual([
            ['fiClientLiquidityDiscover', { intent, network: 'regtest' }],
            [
                'fiClientLiquidityStart',
                {
                    formationId: 'formation',
                    providerPubkey: 'provider',
                    intent,
                },
            ],
            ['fiClientLiquidityResume', { operationId: 'operation' }],
            ['fiClientLiquidityStatus', { operationId: 'operation' }],
            ['fiClientLiquidityCurrent', {}],
            ['fiClientLiquidityList', { after: 'next-after' }],
        ])
    })

    test('forwards post-formation maintenance only through typed RPCs', async () => {
        const operationResult: bindings.RpcFiOperationResult = {
            type: 'success',
        }
        const rpc = jest.fn().mockResolvedValue(operationResult)
        const fedimint = new FedimintBridge(rpc)
        const update: bindings.RpcFiFederationMetadataUpdate = {
            type: 'welcomeMessage',
            value: 'Welcome members',
        }

        await expect(
            fedimint.fiClientUpdateFederationMetadata(update),
        ).resolves.toEqual(operationResult)
        await expect(fedimint.fiClientSetGuardianFee(5_000)).resolves.toEqual(
            operationResult,
        )

        expect(rpc).toHaveBeenNthCalledWith(
            1,
            'fiClientUpdateFederationMetadata',
            { update },
        )
        expect(rpc).toHaveBeenNthCalledWith(2, 'fiClientSetGuardianFee', {
            guardianFeePpm: 5_000,
        })
    })

    test('exposes typed status updates and cancels the private RPC stream', async () => {
        const rpc = jest.fn().mockResolvedValue(undefined)
        const fedimint = new FedimintBridge(rpc)
        const callback = jest.fn()
        const status: bindings.RpcFiClientStatus = {
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
                        fedimintdVersion: '0.11.1',
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

        const unsubscribe = fedimint.fiClientSubscribe({ callback })

        expect(typeof unsubscribe).toBe('function')
        expect(rpc).toHaveBeenCalledWith('fiClientSubscribe', { streamId: 0 })

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

        fedimint.fiClientSubscribe({ callback, onError })
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
        const registered: bindings.RpcFiPushRegistrationResult = {
            type: 'registered',
            installationId: 'phone:mobile:installation',
        }
        const unregistered: bindings.RpcFiPushRegistrationResult = {
            type: 'unregistered',
            installationId: 'phone:mobile:installation',
        }
        const rpc = jest
            .fn()
            .mockResolvedValueOnce(registered)
            .mockResolvedValueOnce(unregistered)
        const fedimint = new FedimintBridge(rpc)

        await expect(
            fedimint.fiClientRegisterPushInstallation(
                'fcm-registration-token',
                'android',
            ),
        ).resolves.toEqual(registered)
        await expect(
            fedimint.fiClientUnregisterPushInstallation(),
        ).resolves.toEqual(unregistered)

        expect(rpc).toHaveBeenNthCalledWith(
            1,
            'fiClientRegisterPushInstallation',
            {
                fcmToken: 'fcm-registration-token',
                platform: 'android',
            },
        )
        expect(rpc).toHaveBeenNthCalledWith(
            2,
            'fiClientUnregisterPushInstallation',
            {},
        )
    })
})
