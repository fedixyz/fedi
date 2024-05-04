import { Community } from '../types'

export const FEDI_GLOBAL_COMMUNITY: Pick<
    Community,
    'id' | 'meta' | 'hasWallet'
> = {
    // this is a hard-coded "fake" federation expected to have configured metadata at the provided URL
    id: '00000000000000000000000066656469',
    meta: {
        meta_override_url: 'https://meta.dev.fedibtc.com/meta.json',
    },
    hasWallet: false,
}
