import { RpcAppFlavor } from './bindings'

export type AnalyticsVoteMethod =
    | 'modal-accept'
    | 'modal-reject'
    | 'modal-dismiss'
    | 'settings-update'

export type AnalyticsConsent = {
    consent: boolean // true iff the user has consented. false on dismissal or rejection
    analyticsId: string // pseudonymous analytics id used only for this
    timestamp: number
    voteMethod: AnalyticsVoteMethod // Lets us track how the user submitted consent (explicit/implicit)
    appFlavor: RpcAppFlavor['type']
}
