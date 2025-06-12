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
import Flex from '../../../ui/Flex'
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
        <Flex grow gap="md" style={style.container}>
            <Flex row align="center" justify="between" gap="lg">
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
            </Flex>
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
        </Flex>
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
        <Flex row align="center" justify="between">
            <Flex row align="center" gap="sm">
                <ChatAvatar user={member} />
                <Flex gap="xxs">
                    <Flex row align="center" gap="sm">
                        <Text bold caption>
                            {member.displayName}
                        </Text>
                        <Text small medium style={style.greyText}>
                            {getUserSuffix(member.id)}
                        </Text>
                    </Flex>
                    {voterRole === 'proposer' && (
                        <Text small medium style={style.greyText}>
                            {t('words.admin')}
                        </Text>
                    )}
                </Flex>
            </Flex>
            <Flex row align="center" gap="sm">
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
            </Flex>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.md,
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
    })

export default GroupVoters
