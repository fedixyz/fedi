import { Text, Theme, useTheme } from '@rneui/themed'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { useObserveMultispendEvent } from '@fedi/common/hooks/matrix'
import { useMultispendWithdrawalRequests } from '@fedi/common/hooks/multispend'
import { selectMatrixRoomMultispendStatus } from '@fedi/common/redux'
import dateUtils from '@fedi/common/utils/DateUtils'
import {
    getUserSuffix,
    isMultispendWithdrawalRejected,
} from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../../state/hooks'
import { MultispendWithdrawalEvent } from '../../../../types'
import { AvatarSize } from '../../../ui/Avatar'
import { Row, Column } from '../../../ui/Flex'
import SvgImage from '../../../ui/SvgImage'
import ChatAvatar from '../../chat/ChatAvatar'

const WithdrawalRequest: React.FC<{
    event: MultispendWithdrawalEvent
    onSelect: () => void
    roomId: string
}> = ({ event, onSelect, roomId }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { haveIVotedForWithdrawal, getWithdrawalRequest } =
        useMultispendWithdrawalRequests({ t, roomId })
    const multispendStatus = useAppSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )

    useObserveMultispendEvent(event.eventId, roomId)

    const {
        sender,
        approvalCount,
        rejectionCount,
        formattedFiatAmount,
        selectedFiatCurrency,
        status,
    } = getWithdrawalRequest(event)

    const haveIVoted = haveIVotedForWithdrawal(event)

    const badge = useMemo(() => {
        let color = theme.colors.orange100
        let text = t('words.pending')

        if (status === 'rejected') {
            color = theme.colors.red100
            text = t('words.rejected')
        } else if (
            status === 'failed' ||
            (multispendStatus &&
                isMultispendWithdrawalRejected(event, multispendStatus))
        ) {
            color = theme.colors.red100
            text = t('words.failed')
        } else if (status === 'completed') {
            color = theme.colors.green100
            text = t('words.complete')
        } else if (status === 'approved') {
            color = theme.colors.green100
            text = t('words.approved')
        }

        return { color, text }
    }, [theme, status, t, event, multispendStatus])

    // don't show the request if sender is not a member of the group
    if (!sender) return null

    const style = styles(theme)

    return (
        <Pressable onPress={onSelect} style={style.container}>
            {!haveIVoted && status === 'pending' && (
                <View style={style.newBadge} />
            )}

            <ChatAvatar user={sender} size={AvatarSize.md} />

            <Column grow gap="sm">
                <Row align="center" justify="between" gap="sm">
                    <Row align="center">
                        <Text
                            medium
                            numberOfLines={1}
                            style={style.displayName}>
                            {sender.displayName}
                        </Text>
                        <Text caption color={theme.colors.grey}>
                            {' '}
                            {getUserSuffix(sender.id)}
                        </Text>
                    </Row>

                    <Row gap="xs" align="center" shrink={false}>
                        <Text medium>{formattedFiatAmount}</Text>
                        <Text bold small>
                            {selectedFiatCurrency}
                        </Text>
                    </Row>
                </Row>

                <Row align="center" justify="between" gap="sm">
                    <Row align="center" gap="sm">
                        <View
                            style={[
                                style.badge,
                                {
                                    backgroundColor: badge.color,
                                },
                            ]}>
                            <Text small medium>
                                {badge.text}
                            </Text>
                        </View>
                        <Row align="center" gap="xs">
                            <Text small>✅</Text>
                            <Text bold>{approvalCount}</Text>
                        </Row>
                        <Row align="center" gap="xs">
                            <Text small>❌</Text>
                            <Text bold>{rejectionCount}</Text>
                        </Row>
                    </Row>

                    <Text caption color={theme.colors.grey}>
                        {dateUtils.formatChatTileTimestamp(event.time / 1000)}
                    </Text>
                </Row>
            </Column>

            <SvgImage name="ChevronRight" size={16} color={theme.colors.grey} />
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            paddingRight: theme.spacing.md,
            paddingLeft: theme.spacing.lg,
            position: 'relative',
        },
        badge: {
            borderRadius: 4,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xxs,
            overflow: 'hidden',
        },
        newBadge: {
            position: 'absolute',
            left: 3,
            width: theme.sizes.unreadIndicatorSize,
            height: theme.sizes.unreadIndicatorSize,
            borderRadius: theme.sizes.unreadIndicatorSize / 2,
            backgroundColor: theme.colors.red,
        },
        displayName: {
            flexShrink: 1,
        },
    })

export default WithdrawalRequest
