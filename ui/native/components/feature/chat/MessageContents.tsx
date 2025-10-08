import Clipboard from '@react-native-clipboard/clipboard'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { ReactNode, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Linking,
    Platform,
    StyleProp,
    StyleSheet,
    TextProps as RNTextProps,
    TextStyle,
    View,
    ViewStyle,
    Text as RNText,
} from 'react-native'
import Hyperlink from 'react-native-hyperlink'

import { useToast } from '@fedi/common/hooks/toast'
import { MatrixRoomMember } from '@fedi/common/types/matrix'
import { makeLog } from '@fedi/common/utils/log'
import {
    decodeFediMatrixRoomUri,
    splitEveryoneRuns,
    splitHtmlRuns,
    parseMentionsFromText,
} from '@fedi/common/utils/matrix'

import EmbeddedJoinGroupButton from './EmbeddedJoinGroupButton'

const log = makeLog('MessageContents')

// Android: prevent the “last run disappears” bug by rendering only <Text> children, giving Hyperlink a single <Text>, and using textBreakStrategy:'simple'.
// For links ending with an emoji, split and render the trailing emoji without underline (tap still works); no NBSP tail needed.
const NEEDS_TAIL_FIX = Platform.OS === 'android'

type MessageContentsProps = {
    content: string
    sentByMe: boolean
    textStyles: StyleProp<ViewStyle | TextStyle>[]
    onMentionPress?: (userId: string) => void
    currentUserId?: string
    roomMembers?: MatrixRoomMember[]
}

const MessageContents: React.FC<MessageContentsProps> = ({
    content,
    sentByMe,
    textStyles,
    onMentionPress,
    currentUserId,
    roomMembers,
}: MessageContentsProps) => {
    const { theme } = useTheme()
    const toast = useToast()
    const { t } = useTranslation()

    const handleLinkPress = useCallback(
        (url: string) => {
            // support tapping matrix.to user links as mentions
            if (onMentionPress) {
                try {
                    const hashIndex = url.indexOf('#/')
                    if (url.includes('matrix.to') && hashIndex !== -1) {
                        const after = url.slice(hashIndex + 2)
                        const decoded = decodeURIComponent(after)

                        // Match a Matrix user ID at start of string: "@localpart:server" (stops before '/', '?', '#')
                        const userMatch = decoded.match(/^@[^:/?#]+:[^/?#]+/)
                        if (userMatch) {
                            const mentionedId = userMatch[0]
                            // swallow taps on self-mentions (don’t open action modal)
                            if (currentUserId && mentionedId === currentUserId)
                                return
                            onMentionPress(mentionedId)
                            return
                        }

                        // Rooms: !roomId:server or #alias:server
                        const roomIdMatch = decoded.match(/^![^:/?#]+:[^/?#]+/)
                        const roomAliasMatch =
                            decoded.match(/^#[^:/?#]+:[^/?#]+/)
                        if (roomIdMatch || roomAliasMatch) {
                            Linking.openURL(url)
                            return
                        }
                    }
                } catch (err) {
                    log.error("Couldn't tap link", { url, err })
                }
            }
            log.debug('url', url)
            Linking.openURL(url)
        },
        [onMentionPress, currentUserId],
    )

    const handleLinkLongPress = useCallback(
        (url: string) => {
            Clipboard.setString(url)
            toast.show({
                content: t('phrases.copied-to-clipboard'),
                status: 'success',
            })
        },
        [toast, t],
    )

    const linkStyle = sentByMe
        ? styles(theme).outgoingLinkedText
        : styles(theme).incomingLinkedText

    // shared renderer used in both branches
    const renderRichBlock = useCallback(
        (
            block: string,
            key?: string | number,
            mediumWeight?: boolean,
        ): React.ReactElement => {
            const androidTextProps: Partial<RNTextProps> = NEEDS_TAIL_FIX
                ? { textBreakStrategy: 'simple' }
                : {}

            // Helper: split the entire trailing emoji *cluster* (handles VS16 + ZWJ chains)
            const splitTrailingEmoji = (
                s: string,
            ): { base: string; emoji: string } => {
                try {
                    const m = s.match(
                        /^(.*?)(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)$/u,
                    )
                    if (m) return { base: m[1], emoji: m[2] }
                } catch (e) {
                    log.warn('Error rendering Emoji content', e)
                }

                if (!s) return { base: s, emoji: '' }
                const cps: number[] = []
                for (let i = 0; i < s.length; ) {
                    const cp = s.codePointAt(i)
                    if (cp === undefined) break
                    cps.push(cp)
                    i += cp > 0xffff ? 2 : 1
                }
                const isRI = (n: number) => n >= 0x1f1e6 && n <= 0x1f1ff
                const isEP = (n: number) =>
                    (n >= 0x1f300 && n <= 0x1faff) ||
                    (n >= 0x1f900 && n <= 0x1f9ff) ||
                    (n >= 0x2600 && n <= 0x27bf)
                const ZWJ = 0x200d,
                    VS16 = 0xfe0f
                let start = cps.length
                while (start > 0) {
                    const cp = cps[start - 1]
                    if (cp === VS16 || cp === ZWJ || isEP(cp) || isRI(cp)) {
                        start--
                        continue
                    }
                    if (
                        start < cps.length &&
                        isRI(cps[start]) &&
                        isRI(cps[start - 1])
                    ) {
                        start--
                        continue
                    }
                    break
                }
                if (start === cps.length) return { base: s, emoji: '' }
                let idx = 0,
                    k = 0
                while (k < start) {
                    const cp = cps[k++]
                    idx += cp > 0xffff ? 2 : 1
                }
                return { base: s.slice(0, idx), emoji: s.slice(idx) }
            }

            const hasHtml =
                /<a\s+href="/i.test(block) || /<br\s*\/?>/i.test(block)

            if (!hasHtml) {
                const trimmed = block.trim()
                if (roomMembers && trimmed) {
                    try {
                        const { formattedBody } = parseMentionsFromText(
                            trimmed,
                            roomMembers,
                        )
                        if (
                            formattedBody &&
                            /<a\s+href="/i.test(formattedBody)
                        ) {
                            return renderRichBlock(
                                formattedBody,
                                key ?? 'plain-upgraded',
                                mediumWeight,
                            )
                        }
                    } catch (err) {
                        log.warn(
                            'mention-parse: failed to upgrade plain text',
                            {
                                err,
                            },
                        )
                    }
                }

                const parts = splitEveryoneRuns(trimmed)
                return (
                    <Text
                        key={key ?? 'plain'}
                        caption
                        {...(mediumWeight ? { medium: true } : {})}
                        {...androidTextProps}
                        style={[...textStyles, styles(theme).consistentText]}>
                        {parts.map((p, idx) =>
                            p.type === 'everyone' ? (
                                <RNText
                                    key={`ev-${idx}`}
                                    style={[
                                        linkStyle,
                                        styles(theme).consistentText,
                                    ]}>
                                    {p.text}
                                </RNText>
                            ) : (
                                <RNText
                                    key={`tx-${idx}`}
                                    style={[styles(theme).consistentText]}>
                                    {p.text}
                                </RNText>
                            ),
                        )}

                        {NEEDS_TAIL_FIX && (
                            <RNText
                                accessibilityElementsHidden
                                importantForAccessibility="no-hide-descendants"
                                style={styles(theme).tail}>
                                {'\u200B'}
                            </RNText>
                        )}
                    </Text>
                )
            }

            const runs = splitHtmlRuns(block)
            return (
                <Text
                    key={key ?? 'rich'}
                    caption
                    {...(mediumWeight ? { medium: true } : {})}
                    {...androidTextProps}
                    style={[...textStyles, styles(theme).consistentText]}>
                    {runs.flatMap((r, idx) => {
                        if (r.type === 'link' && r.href) {
                            let isSelf = false
                            try {
                                const hashIndex = r.href.indexOf('#/')
                                if (
                                    r.href.includes('matrix.to') &&
                                    hashIndex !== -1
                                ) {
                                    const after = r.href.slice(hashIndex + 2)
                                    const decoded = decodeURIComponent(after)
                                    const userMatch =
                                        decoded.match(/^@[^:/?#]+:[^/?#]+/)
                                    if (userMatch) {
                                        isSelf =
                                            !!currentUserId &&
                                            userMatch[0] === currentUserId
                                    }
                                }
                            } catch (err) {
                                log.warn(
                                    'mention-highlight: failed to parse matrix.to user link; skipping self-highlight',
                                    {
                                        href: r.href,
                                        err,
                                    },
                                )
                            }

                            // Avoid underlining trailing emoji in the link text (Android paint bug)
                            const { base, emoji } =
                                Platform.OS === 'android'
                                    ? splitTrailingEmoji(r.text)
                                    : { base: r.text, emoji: '' }
                            if (emoji) {
                                return (
                                    <RNText
                                        key={`lnk-${idx}`}
                                        onPress={
                                            isSelf
                                                ? undefined
                                                : () => handleLinkPress(r.href)
                                        }
                                        onLongPress={() =>
                                            handleLinkLongPress(r.href)
                                        }
                                        style={[styles(theme).consistentText]}>
                                        <RNText
                                            style={[
                                                linkStyle,
                                                styles(theme).consistentText,
                                                isSelf
                                                    ? styles(theme).selfMention
                                                    : null,
                                            ]}>
                                            {base}
                                        </RNText>
                                        <RNText
                                            style={[
                                                linkStyle,
                                                styles(theme).consistentText,
                                                { textDecorationLine: 'none' },
                                            ]}>
                                            {emoji}
                                        </RNText>
                                    </RNText>
                                )
                            }

                            return (
                                <Text
                                    key={`lnk-${idx}`}
                                    caption
                                    {...(mediumWeight ? { medium: true } : {})}
                                    style={[
                                        linkStyle,
                                        styles(theme).consistentText,
                                        isSelf
                                            ? styles(theme).selfMention
                                            : null,
                                    ]}
                                    suppressHighlighting
                                    onPress={
                                        isSelf
                                            ? undefined
                                            : () => handleLinkPress(r.href)
                                    }
                                    onLongPress={() =>
                                        handleLinkLongPress(r.href)
                                    }>
                                    {r.text}
                                </Text>
                            )
                        }

                        const parts = splitEveryoneRuns(r.text)
                        return parts.map((p, j) =>
                            p.type === 'everyone' ? (
                                <RNText
                                    key={`ev-${idx}-${j}`}
                                    style={[
                                        linkStyle,
                                        styles(theme).consistentText,
                                    ]}>
                                    {p.text}
                                </RNText>
                            ) : (
                                <RNText
                                    key={`tx-${idx}-${j}`}
                                    style={[styles(theme).consistentText]}>
                                    {p.text}
                                </RNText>
                            ),
                        )
                    })}
                    {NEEDS_TAIL_FIX && (
                        <RNText
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                            style={styles(theme).tail}>
                            {'\u200B'}
                        </RNText>
                    )}
                </Text>
            )
        },
        [
            handleLinkLongPress,
            handleLinkPress,
            linkStyle,
            textStyles,
            theme,
            currentUserId,
            roomMembers,
        ],
    )

    let text: ReactNode = null
    // Check if there are any group invite codes in the message like this
    //      fedi:room:uuid_generated_on_group_creation:::
    const regex = /fedi:room:[^\s\n]*:::/g
    const groupCodeMatches: string[] | null = content.match(regex)

    // groupCodeMatches is null if no group invite code is found
    if (groupCodeMatches) {
        // construct an array that identifies text content from group invite
        // code strings as separate renderable elements
        const messageElements: string[] = []

        groupCodeMatches.reduce(
            (contentString: string, match: string, index: number) => {
                const splitText = contentString.split(match)
                const textBeforeCode = splitText[0]
                const textAfterCode = splitText[1]

                messageElements.push(textBeforeCode)
                messageElements.push(match)

                if (index + 1 === groupCodeMatches?.length) {
                    messageElements.push(textAfterCode)
                }

                return textAfterCode
            },
            content,
        )

        text = (
            <View>
                {messageElements.map((m: string, i: number) => {
                    if (!m) return null
                    const isMatrixChatGroupCode = m.startsWith('fedi:room:')
                    if (isMatrixChatGroupCode) {
                        const groupId = decodeFediMatrixRoomUri(m)
                        return (
                            <EmbeddedJoinGroupButton
                                key={`mi-t-${i}`}
                                groupId={groupId}
                            />
                        )
                    }
                    const segHasHtml = /<a\s+href="/i.test(m)
                    const segHasBareUrl = /\b(?:https?:\/\/|www\.)\S+/i.test(m)
                    return !segHasHtml && segHasBareUrl ? (
                        <Hyperlink
                            key={`mi-t-${i}`}
                            linkStyle={linkStyle}
                            onPress={handleLinkPress}
                            onLongPress={handleLinkLongPress}
                            children={renderRichBlock(m, `blk-${i}`)}
                        />
                    ) : (
                        renderRichBlock(m, `blk-${i}`)
                    )
                })}
            </View>
        )
    } else {
        // otherwise just render text normally with consistent container
        const contentHasHtml = /<a\s+href="/i.test(content)
        const contentHasBareUrl = /\b(?:https?:\/\/|www\.)\S+/i.test(content)
        const onlyText = renderRichBlock(content, 'only')

        text = (
            <View style={styles(theme).hyperlink}>
                {!contentHasHtml && contentHasBareUrl ? (
                    <Hyperlink
                        linkStyle={linkStyle}
                        onPress={handleLinkPress}
                        onLongPress={handleLinkLongPress}
                        children={onlyText}
                    />
                ) : (
                    onlyText
                )}
            </View>
        )
    }

    // final render
    return <>{text}</>
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        topPaddedText: {
            marginTop: theme.spacing.sm,
        },
        bottomPaddedText: {
            marginBottom: theme.spacing.sm,
        },
        consistentText: {
            marginVertical: theme.spacing.xs / 2,
        },
        incomingLinkedText: {
            textDecorationLine: 'underline',
            color: theme.colors.blue,
        },
        outgoingLinkedText: {
            textDecorationLine: 'underline',
            color: theme.colors.secondary,
        },
        selfMention: {
            fontWeight: '700',
        },
        hyperlink: {
            minHeight: 20,
        },
        tail: {
            opacity: 0,
            includeFontPadding: false,
        },
    })

export default MessageContents
