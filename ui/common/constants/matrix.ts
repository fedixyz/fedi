// dev & staging use a different homeserver than prod, but all 3 use the same push server
// TODO: consider hosting a separate push server for each homeserver?
export const GLOBAL_MATRIX_PUSH_SERVER = 'https://sygnal.m1.8fa.in'

export const BANNED_DISPLAY_NAME_TERMS = [
    'admin',
    'fedi',
    'moderator',
    'support',
    'superuser',
    'helpdesk',
    'security',
]

export const GUARDIANITO_BOT_DISPLAY_NAME = 'G-Bot'
export const INVALID_NAME_PLACEHOLDER = 'Invalid Name'

export const ONE_KB = 1024
// A megabyte is 1024 kilobytes, not 1000 kilobytes
export const ONE_MB = 1024 * ONE_KB
export const MAX_IMAGE_SIZE = 100 * ONE_MB // 100MB for images
export const MAX_FILE_SIZE = 500 * ONE_MB // 500MB for other files

//HTML comversion for special characters
export const HTML_ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
} as const

export const MX_REPLY_REGEX = /<mx-reply>[\s\S]*?<\/mx-reply>/g // matches mx-reply blocks with any content including newlines
export const BR_TAG_REGEX = /<br\s*\/?>/gi // matches <br>, <br/>, <br /> tags (case insensitive)
export const HTML_TAG_REGEX = /<[^>]*>/g // matches any HTML tag
export const QUOTE_USER_REGEX = /^> <@([^>]+)>/ // matches quote line and captures user ID
