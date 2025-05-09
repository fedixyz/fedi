import { Text, Theme, useTheme } from '@rneui/themed'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'

import {
    selectMatrixRoomMember,
    selectMatrixRoomMultispendStatus,
    selectMultispendRole,
} from '@fedi/common/redux'
import { getUserSuffix } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../../state/hooks'
import OverlaySelect from '../../../ui/OverlaySelect'
import ChatAvatar from '../../chat/ChatAvatar'

type Props = {
    roomId: string
}

const GroupVoters: React.FC<Props> = ({ roomId }) => {
    const multispendStatus = useAppSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )

    const [filter, setFilter] = useState('all')
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)

    const getVoterStatus = useCallback(
        (signer: string) => {
            if (multispendStatus?.status !== 'activeInvitation')
                return 'pending'

            if (
                multispendStatus.state.proposer === signer ||
                Object.keys(multispendStatus?.state.pubkeys).includes(signer)
            )
                return 'approved'

            if (multispendStatus?.state.rejections.includes(signer))
                return 'rejected'

            return 'pending'
        },
        [multispendStatus],
    )

    const filteredSigners = useMemo(() => {
        if (multispendStatus?.status !== 'activeInvitation') return []

        return multispendStatus.state.invitation.signers.filter(signer => {
            if (filter === 'all') return true
            if (filter === 'pending')
                return getVoterStatus(signer) === 'pending'
            if (filter === 'approved')
                return getVoterStatus(signer) === 'approved'
            if (filter === 'rejected')
                return getVoterStatus(signer) === 'rejected'
        })
    }, [filter, multispendStatus, getVoterStatus])

    return (
        <View style={style.container}>
            <View style={style.header}>
                <Text medium>{t('words.voters')}</Text>
                <OverlaySelect
                    value={filter}
                    onValueChange={setFilter}
                    options={[
                        {
                            value: 'all',
                            label: t('feature.multispend.all-voters'),
                        },
                        { value: 'pending', label: t('words.pending') },
                        { value: 'accepted', label: t('words.accepted') },
                        { value: 'rejected', label: t('words.rejected') },
                    ]}
                />
            </View>
            {multispendStatus?.status === 'activeInvitation' && (
                <View style={style.incompleteNotice}>
                    <Text style={style.greyText} caption>
                        {t('feature.multispend.incomplete-notice')}
                    </Text>
                </View>
            )}
            <ScrollView
                style={style.votersContainer}
                contentContainerStyle={style.voters}>
                {filteredSigners.map((signer, i) => (
                    <MultispendVoter
                        key={`multispend-voter-${i}`}
                        roomId={roomId}
                        pubkey={signer}
                        status={getVoterStatus(signer)}
                    />
                ))}
            </ScrollView>
        </View>
    )
}

function MultispendVoter({
    pubkey,
    roomId,
    status,
}: {
    pubkey: string
    roomId: string
    status: 'pending' | 'approved' | 'rejected'
}) {
    const member = useAppSelector(s =>
        selectMatrixRoomMember(s, roomId, pubkey),
    )
    const voterRole = useAppSelector(s =>
        selectMultispendRole(s, roomId, pubkey),
    )
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)

    if (!member) return null

    return (
        <View style={style.voter}>
            <View style={style.voterInfo}>
                <ChatAvatar user={member} />
                <View style={style.voterNameAndRole}>
                    <View style={style.voterNameAndId}>
                        <Text bold caption>
                            {member.displayName}
                        </Text>
                        <Text small medium style={style.greyText}>
                            {getUserSuffix(member.id)}
                        </Text>
                    </View>
                    {voterRole === 'proposer' && (
                        <Text small medium style={style.greyText}>
                            {t('words.admin')}
                        </Text>
                    )}
                </View>
            </View>
            <View style={style.voterInfo}>
                <Text medium style={style.greyText} small>
                    {t(
                        status === 'approved'
                            ? 'words.approved'
                            : status === 'rejected'
                              ? 'words.rejected'
                              : 'words.pending',
                    )}
                </Text>
                <Text caption>
                    {status === 'approved'
                        ? '✅'
                        : status === 'rejected'
                          ? '❌'
                          : '⏳'}
                </Text>
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            flexDirection: 'column',
            gap: theme.spacing.md,
            padding: theme.spacing.md,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.lg,
        },
        incompleteNotice: {
            backgroundColor: theme.colors.offWhite,
            padding: theme.spacing.md,
            borderRadius: 8,
        },
        greyText: {
            color: theme.colors.grey,
        },
        votersContainer: {
            flex: 1,
        },
        voters: {
            flexDirection: 'column',
            gap: theme.spacing.md,
        },
        voter: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        voterInfo: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        voterNameAndRole: {
            flexDirection: 'column',
            gap: theme.spacing.xxs,
        },
        voterNameAndId: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
    })

export default GroupVoters
