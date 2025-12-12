import { selectMatrixAuth } from '@fedi/common/redux'
import { encodeFediMatrixUserUri } from '@fedi/common/utils/matrix'

import { parseUserInput } from '../../../utils/parser'
import { createIntegrationTestBuilder } from '../../utils/remote-bridge-setup'
import { createMockT } from '../../utils/setup'

describe('/utils/parser', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    // fedi:user:@npub1...
    describe('When a fedi:user:@npub string is parsed', () => {
        it('should return the correct user response', async () => {
            const { store, bridge } = context
            await builder.withChatReady()

            const t = createMockT()

            const user = selectMatrixAuth(store.getState())
            const fediUserStr = encodeFediMatrixUserUri(user?.userId || '')

            const result = await parseUserInput(
                fediUserStr,
                bridge.fedimint,
                t,
                '1',
                false,
            )

            expect(result.type).toBe('fedi:user')
            expect(result).toHaveProperty('data')
            expect(result.data).toHaveProperty('id')
            expect(result.data).toHaveProperty('displayName')
        })
    })
})
