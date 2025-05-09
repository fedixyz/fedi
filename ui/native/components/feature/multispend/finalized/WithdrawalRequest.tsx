import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { useObserveMultispendEvent } from '@fedi/common/hooks/matrix'
import { useMultispendWithdrawalRequests } from '@fedi/common/hooks/multispend'
import dateUtils from '@fedi/common/utils/DateUtils'
import { getUserSuffix } from '@fedi/common/utils/matrix'

import { fedimint } from '../../../../bridge'
import { MultispendWithdrawalEvent } from '../../../../types'
import { AvatarSize } from '../../../ui/Avatar'
import SvgImage from '../../../ui/SvgImage'
import ChatAvatar from '../../chat/ChatAvatar'

const WithdrawalRequest: React.FC<{
    event: MultispendWithdrawalEvent
    onSelect: () => void
    roomId: string
}> = ({ event, onSelect, roomId }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const {
        haveIVotedForWithdrawal,
        getWithdrawalStatus,
        getWithdrawalRequest,
    } = useMultispendWithdrawalRequests({ t, fedimint, roomId })

    useObserveMultispendEvent(event.id, roomId)

    const {
        sender,
        approvalCount,
        rejectionCount,
        formattedFiatAmount,
        selectedFiatCurrency,
    } = getWithdrawalRequest(event)

    const withdrawalStatus = getWithdrawalStatus(event)
    const haveIVoted = haveIVotedForWithdrawal(event)

    // don't show the request if sender is not a member of the group
    if (!sender) return null

    const style = styles(theme)

    return (
        <Pressable onPress={onSelect} style={style.container}>
            {!haveIVoted && withdrawalStatus === 'pending' && (
                <View style={style.newBadge} />
            )}

            <ChatAvatar user={sender} size={AvatarSize.md} />

            <View style={style.content}>
                <View style={style.contentRow}>
                    <View style={style.nameContainer}>
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
                    </View>

                    <View style={style.amount}>
                        <Text medium>{formattedFiatAmount}</Text>
                        <Text bold small>
                            {selectedFiatCurrency}
                        </Text>
                    </View>
                </View>

                <View style={style.contentRow}>
                    <View style={style.statusContainer}>
                        <View
                            style={[
                                style.badge,
                                {
                                    backgroundColor:
                                        withdrawalStatus === 'pending'
                                            ? theme.colors.orange100
                                            : withdrawalStatus === 'rejected'
                                              ? theme.colors.red100
                                              : theme.colors.green100,
                                },
                            ]}>
                            <Text small medium>
                                {withdrawalStatus === 'pending'
                                    ? t('words.pending')
                                    : withdrawalStatus === 'rejected'
                                      ? t('words.rejected')
                                      : withdrawalStatus === 'approved'
                                        ? t('words.approved')
                                        : t('words.complete')}
                            </Text>
                        </View>
                        <View style={style.voteCount}>
                            <Text small>✅</Text>
                            <Text bold>{approvalCount}</Text>
                        </View>
                        <View style={style.voteCount}>
                            <Text small>❌</Text>
                            <Text bold>{rejectionCount}</Text>
                        </View>
                    </View>

                    <Text caption color={theme.colors.grey}>
                        {dateUtils.formatChatTileTimestamp(event.time / 1000)}
                    </Text>
                </View>
            </View>

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
        content: {
            flexDirection: 'column',
            flex: 1,
            gap: theme.spacing.sm,
        },
        contentRow: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.sm,
        },
        amount: {
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: theme.spacing.xs,
            flexShrink: 0,
        },
        voteCount: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
        },
        statusContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
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
        nameContainer: {
            flexDirection: 'row',
            alignItems: 'center',
        },
    })

export default WithdrawalRequest
