import { okAsync } from 'neverthrow'

import { RpcMethods } from '../../types/bindings'
import { FedimintBridge } from '../../utils/fedimint'

// mock for when you need to pass a FedimintBridge to a hook
export const createMockFedimintBridge = (
    methods: Partial<Record<keyof RpcMethods, unknown>> = {},
): jest.Mocked<FedimintBridge> => {
    const mockBridge: Record<string, jest.Mock> = {
        rpc: jest.fn(),
        rpcTyped: jest.fn(),
        addListener: jest.fn(() => () => {}),
    }

    // Allow all methods to be used in `rpcResult`
    mockBridge.rpcResult = jest.fn().mockImplementation((method: string) => {
        if (method in methods && methods?.[method as keyof typeof methods])
            return okAsync(methods[method as keyof typeof methods])

        return okAsync()
    })

    // Add the RPC method directly to the mockBridge object
    // for direct methods like `fedimint.generateInvoice`
    for (const [key, value] of Object.entries(methods)) {
        mockBridge[key] = jest.fn().mockImplementation(() => value)
    }

    return mockBridge as unknown as jest.Mocked<FedimintBridge>
}
export type MockFedimintBridge = ReturnType<typeof createMockFedimintBridge>
