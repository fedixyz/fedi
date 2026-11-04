import { bech32m } from 'bech32'

export const communityInvites = [
    {
        prefix: 'fedi:community',
        data: { community_meta_url: 'https://example.com/space.json' },
    },
    {
        prefix: 'fedi:community2',
        data: {
            author_pubkey:
                '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
            community_uuid_hex: '00'.repeat(32),
            decryption_key: Buffer.alloc(32).toString('base64'),
        },
    },
].map(({ prefix, data }) => {
    const payload = Buffer.from(JSON.stringify(data))
    return {
        prefix,
        payload,
        invite: bech32m.encode(prefix, bech32m.toWords(payload), 2000),
    }
})
