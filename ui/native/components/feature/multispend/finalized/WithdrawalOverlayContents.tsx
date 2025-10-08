import { Text, Theme, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { useMultispendWithdrawalRequests } from '@fedi/common/hooks/multispend'
import { selectMatrixRoomMembers } from '@fedi/common/redux'
import { getUserSuffix } from '@fedi/common/utils/matrix'

import { fedimint } from '../../../../bridge'
import { useAppSelector } from '../../../../state/hooks'
import { MatrixRoomMember, MultispendWithdrawalEvent } from '../../../../types'
import { AvatarSize } from '../../../ui/Avatar'
import AvatarStack from '../../../ui/AvatarStack'
import Flex from '../../../ui/Flex'
import SvgImage from '../../../ui/SvgImage'
import ChatAvatar from '../../chat/ChatAvatar'

const WithdrawalOverlayContents: React.FC<{
    selectedWithdrawal: MultispendWithdrawalEvent
    roomId: string
}> = ({ selectedWithdrawal, roomId }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const {
        getWithdrawalRequest,
        haveIVotedForWithdrawal,
        canVoteOnWithdrawals,
    } = useMultispendWithdrawalRequests({
        t,
        fedimint,
        roomId,
    })

    const { sender, approvals, rejections, formattedFiatAmountWithCurrency } =
        getWithdrawalRequest(selectedWithdrawal)

    const haveIVoted = selectedWithdrawal
        ? haveIVotedForWithdrawal(selectedWithdrawal)
        : false

    const style = styles(theme)

    return (
        <Flex grow gap="md" style={style.container}>
            <Text>
                <Trans
                    i18nKey="feature.multispend.user-wants-to-withdraw"
                    values={{
                        user: sender?.displayName,
                        amount: formattedFiatAmountWithCurrency,
                    }}
                    components={{ bold: <Text bold /> }}
                />
            </Text>
            <View style={style.reasonContainer}>
                <Text>
                    {selectedWithdrawal.event.withdrawalRequest.description}
                </Text>
            </View>
            <VoterDropdown
                roomId={roomId}
                userIds={approvals}
                status="approve"
            />
            <VoterDropdown
                roomId={roomId}
                userIds={rejections}
                status="reject"
            />
            {(haveIVoted || !canVoteOnWithdrawals) && (
                <Flex align="center" style={style.votedContainer}>
                    <Text style={style.votedText}>
                        {t(
                            haveIVoted
                                ? 'feature.multispend.already-voted'
                                : 'feature.multispend.no-permission-to-vote',
                        )}
                    </Text>
                </Flex>
            )}
        </Flex>
    )
}

function VoterDropdown({
    roomId,
    userIds,
    status,
}: {
    roomId: string
    userIds: string[]
    status: 'approve' | 'reject'
}) {
    const [open, setOpen] = useState(false)

    const { theme } = useTheme()
    const { t } = useTranslation()
    const roomMembers = useAppSelector(s => selectMatrixRoomMembers(s, roomId))
    const members = roomMembers.filter(member => userIds.includes(member.id))

    const style = styles(theme)

    return (
        <View>
            <Pressable
                style={style.dropdownHeader}
                onPress={() => setOpen(!open)}
                disabled={userIds.length === 0}>
                <Text medium>
                    <Text caption>{status === 'approve' ? '✅' : '❌'}</Text>{' '}
                    {t(
                        status === 'approve'
                            ? 'feature.multispend.n-approvals'
                            : 'feature.multispend.n-rejections',
                        {
                            n: userIds.length,
                        },
                    )}
                </Text>
                <Flex row align="center" gap="sm">
                    <AvatarStack
                        data={members}
                        renderAvatar={member => (
                            <ChatAvatar user={member} size={AvatarSize.sm} />
                        )}
                    />
                    <SvgImage
                        name={
                            userIds.length === 0
                                ? 'Minus'
                                : open
                                  ? 'ChevronDown'
                                  : 'ChevronRight'
                        }
                        size={16}
                        color={theme.colors.grey}
                    />
                </Flex>
            </Pressable>
            {open && (
                <Flex gap="sm" style={style.dropdownContent}>
                    {members.map((member, i) => (
                        <ThinAvatarRow
                            key={`multispend-voter-dropdown-${status}-${i}`}
                            member={member}
                        />
                    ))}
                </Flex>
            )}
        </View>
    )
}

function ThinAvatarRow({ member }: { member: MatrixRoomMember }) {
    const { theme } = useTheme()

    return (
        <Flex row align="center" gap="sm">
            <ChatAvatar user={member} size={AvatarSize.sm} />
            <Text caption medium numberOfLines={1}>
                {member.displayName}{' '}
                <Text small color={theme.colors.grey}>
                    {getUserSuffix(member.id)}
                </Text>
            </Text>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.md,
        },
        votedContainer: {
            paddingHorizontal: theme.spacing.md,
            paddingTop: theme.spacing.lg,
        },
        reasonContainer: {
            padding: theme.spacing.md,
            borderRadius: 12,
            backgroundColor: theme.colors.extraLightGrey,
        },
        dropdownHeader: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        dropdownContent: {
            paddingVertical: theme.spacing.sm,
        },
        votedText: {
            color: theme.colors.grey,
            textAlign: 'center',
        },
    })

export default WithdrawalOverlayContents
