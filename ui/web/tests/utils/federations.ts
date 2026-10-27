import metaFederationsNightly from '../../public/meta-federations-nightly.json'

export function nightlyFederationInvite(name: string): string {
    const entry = Object.values(metaFederationsNightly).find(
        federation => federation.federation_name === name,
    )
    if (!entry?.invite_code) {
        throw new Error(`no "${name}" invite in meta-federations-nightly.json`)
    }
    return entry.invite_code
}
