import { RejectionError } from 'webln'

import {
    DROP_INJECTION_RESPONSE,
    InjectionMessageResponseMap,
    InjectionMessageType,
} from '@fedi/injections'

type SeedRequest =
    InjectionMessageResponseMap[InjectionMessageType.fedi_getSeed]['message']
type SeedResponse =
    InjectionMessageResponseMap[InjectionMessageType.fedi_getSeed]['response']

type SeedRequestDependencies = {
    getCurrentUrl: () => string
    isEnabled: () => boolean
    requirePin: () => Promise<void>
    requestConsent: (request: { origin: string }) => Promise<boolean>
    getSeed: (request: { url: string }) => Promise<SeedResponse>
}

export class MiniAppSeedRequestController {
    private pending = false

    async handle(
        _request: SeedRequest,
        dependencies: SeedRequestDependencies,
    ): Promise<SeedResponse | typeof DROP_INJECTION_RESPONSE> {
        if (!dependencies.isEnabled()) {
            throw new Error('Mini app seed is not available')
        }

        const requestUrl = dependencies.getCurrentUrl()
        const requestOrigin = new URL(requestUrl).origin

        if (this.pending) {
            throw new Error('Another mini app seed request is already pending')
        }

        this.pending = true
        try {
            await dependencies.requirePin()

            const approved = await dependencies.requestConsent({
                origin: requestOrigin,
            })
            if (!approved) {
                throw new RejectionError('Mini app seed request denied')
            }

            const response = await dependencies.getSeed({
                url: requestUrl,
            })
            // The seed is origin-bound, so same-origin navigations keep their
            // reply; a different origin is a document that never asked.
            if (
                new URL(dependencies.getCurrentUrl()).origin !== requestOrigin
            ) {
                return DROP_INJECTION_RESPONSE
            }

            return response
        } finally {
            this.pending = false
        }
    }
}
