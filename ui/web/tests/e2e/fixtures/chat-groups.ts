// Mirrors the group matrix exercised by the native appium chat e2e
// (ui/native/tests/appium/common/chatGroups.ts) so web and native cover the
// same room shapes.
export type Group = {
    name: string
    message: string
    isPublic: boolean
    broadcastOnly: boolean
}

export const PRIVATE_GROUP: Group = {
    name: 'E2E Private Group',
    message: 'This is a private group message',
    isPublic: false,
    broadcastOnly: false,
}
export const BROADCAST_GROUP: Group = {
    name: 'E2E Broadcast Group',
    message: 'This is a broadcast-only message',
    isPublic: false,
    broadcastOnly: true,
}
export const PUBLIC_GROUP: Group = {
    name: 'E2E Public Group',
    message: 'This is a public group message',
    isPublic: true,
    broadcastOnly: false,
}
export const PUBLIC_BROADCAST_GROUP: Group = {
    name: 'E2E Public Broadcast Group',
    message: 'This is a public broadcast message',
    isPublic: true,
    broadcastOnly: true,
}

export const ALL_GROUPS: Group[] = [
    PRIVATE_GROUP,
    BROADCAST_GROUP,
    PUBLIC_GROUP,
    PUBLIC_BROADCAST_GROUP,
]
// Private rooms default to allowKnocking=true (mutex with isPublic),
// so both private groups are knockable; the public ones are not.
export const KNOCKABLE_GROUPS: Group[] = [PRIVATE_GROUP, BROADCAST_GROUP]
