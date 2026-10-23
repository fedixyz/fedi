import fs from 'fs'
import path from 'path'

type PublicFederationMeta = {
    federation_name?: string
    invite_code?: string
}

export function getNightlyFederationInvite(federationName: string): string {
    const metaPath = path.resolve(
        __dirname,
        '../../../../web/public/meta-federations-nightly.json',
    )
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Record<
        string,
        PublicFederationMeta
    >
    const federation = Object.values(meta).find(
        f => f.federation_name === federationName,
    )
    if (!federation?.invite_code) {
        throw new Error(
            `No invite code found for nightly federation "${federationName}"`,
        )
    }
    return federation.invite_code
}
