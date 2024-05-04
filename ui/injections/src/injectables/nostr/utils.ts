import encryptionUtils from '@fedi/common/utils/EncryptionUtils'

import { UnsignedNostrEvent } from './types'

export function eventHashFromEvent(
    pub_key: string,
    evt: UnsignedNostrEvent,
): string {
    return encryptionUtils.toSha256EncHex(
        JSON.stringify([
            0,
            pub_key,
            evt.created_at,
            evt.kind,
            evt.tags,
            evt.content,
        ]),
    )
}
