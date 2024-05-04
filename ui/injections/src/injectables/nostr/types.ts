export interface UnsignedNostrEvent {
    created_at: number
    kind: number
    content: string
    tags: Array<Array<string>>
}

export interface SignedNostrEvent extends UnsignedNostrEvent {
    id: string
    pubkey: string
    sig: string
}

export interface NostrNip07Provider {
    getPublicKey(): Promise<string>
    signEvent(event: UnsignedNostrEvent): Promise<SignedNostrEvent>
}
