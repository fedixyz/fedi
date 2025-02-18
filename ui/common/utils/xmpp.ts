/** @deprecated XMPP legacy code */
export function decodeLegacyGroupInvitationLink(link: string): string {
    const afterPrefix = link.split('fedi:group:')[1]
    if (!afterPrefix) throw new Error('feature.chat.invalid-group')
    let groupId = afterPrefix.slice(0, -3)

    // handle old group invite codes for backwards compatibility
    // new group codes have 3 trailing colons `:::` after the group ID
    const encodingSuffix = afterPrefix.slice(-3)
    if (encodingSuffix !== ':::') {
        groupId = afterPrefix
    }

    if (!groupId) throw new Error('feature.chat.invalid-group')

    return groupId
}

/** @deprecated XMPP legacy code */
export function decodeLegacyDirectChatLink(link: string): string {
    const afterPrefix = link.split('fedi:member:')[1]
    if (!afterPrefix) throw new Error('feature.chat.invalid-member')

    const memberId = afterPrefix.slice(0, -3)

    if (!memberId) throw new Error('feature.chat.invalid-member')

    return memberId
}
