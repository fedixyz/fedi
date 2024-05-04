import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import {
    joinChatGroup,
    selectActiveFederationId,
    selectChatGroup,
} from '@fedi/common/redux'
import { encodeGroupInvitationLink } from '@fedi/common/utils/xmpp'

import QRScreen from '../components/ui/QRScreen'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'GroupInvite'>

const GroupInvite: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { groupId } = route.params
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const dispatch = useAppDispatch()
    const group = useAppSelector(s => selectChatGroup(s, groupId))
    const groupInvitationLink = encodeGroupInvitationLink(groupId)

    useEffect(() => {
        const handleJoinGroup = async () => {
            await dispatch(
                joinChatGroup({
                    federationId: activeFederationId as string,
                    link: groupId,
                }),
            )
        }
        handleJoinGroup()
    }, [activeFederationId, dispatch, groupId])

    return (
        <QRScreen
            title={group?.name}
            qrValue={groupInvitationLink}
            copyMessage={t('feature.chat.copied-group-invite-code')}
        />
    )
}

export default GroupInvite
