import metaFederationsNightly from '../../public/meta-federations-nightly.json'

type FederationMeta = { federation_name?: string; invite_code: string }

// Invite code for a federation in the nightly meta (what the app serves in
// nightly flavor), looked up by display name so the e2e tracks the real entry
// rather than a hardcoded copy. The entry's presence is guarded by
// tests/unit/utils/federations.test.ts.
export function nightlyFederationInvite(name: string): string {
    const entry = Object.values(
        metaFederationsNightly as Record<string, FederationMeta>,
    ).find(f => f.federation_name === name)
    if (!entry) {
        throw new Error(`no "${name}" entry in meta-federations-nightly.json`)
    }
    return entry.invite_code
}
