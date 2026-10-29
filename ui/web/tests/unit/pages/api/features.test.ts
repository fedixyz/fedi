import type { NextApiRequest, NextApiResponse } from 'next'

import type { RemoteFeatures } from '@fedi/common/types/bindings'

describe('remote feature serving', () => {
    const originalEnv = process.env.VERCEL_ENV
    afterEach(() => {
        if (originalEnv === undefined) delete process.env.VERCEL_ENV
        else process.env.VERCEL_ENV = originalEnv
    })

    const serve = async (env: string, flavor: string | undefined) => {
        process.env.VERCEL_ENV = env
        let handler: typeof import('../../../../src/pages/api/features').default
        jest.isolateModules(() => {
            handler = require('../../../../src/pages/api/features').default
        })
        const response = {
            setHeader: jest.fn(),
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        }
        await handler!(
            {
                method: 'GET',
                query: { env: flavor },
            } as unknown as NextApiRequest,
            response as unknown as NextApiResponse<RemoteFeatures>,
        )
        return response
    }

    it.each([
        ['production', undefined, false],
        ['production', 'edge', true],
        ['preview', undefined, true],
        ['preview', 'edge', true],
        ['development', undefined, true],
    ])(
        'should serve transfers for %s with flavor %s as %s',
        async (env, flavor, enabled) => {
            const response = await serve(env, flavor)
            expect(response.json).toHaveBeenCalledWith(
                expect.objectContaining({ federationTransfers: enabled }),
            )
            expect(response.setHeader).toHaveBeenCalledWith(
                'Cache-Control',
                'no-store',
            )
        },
    )

    it.each([
        ['production', undefined, false],
        ['production', 'edge', false],
        ['preview', undefined, true],
        ['preview', 'edge', false],
        ['development', undefined, true],
    ])(
        'should serve the update prompt for %s with flavor %s as %s',
        async (env, flavor, enabled) => {
            const response = await serve(env, flavor)
            expect(response.json).toHaveBeenCalledWith(
                expect.objectContaining({ updateScreen: enabled }),
            )
        },
    )

    it.each([
        ['production', undefined, false],
        ['production', 'edge', false],
        ['preview', undefined, true],
        ['preview', 'edge', true],
        ['development', undefined, true],
    ])(
        'should serve guardian replacement for %s with flavor %s as %s',
        async (env, flavor, enabled) => {
            const response = await serve(env, flavor)
            expect(response.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    walletServiceGuardianTransfer: enabled,
                }),
            )
        },
    )
})
