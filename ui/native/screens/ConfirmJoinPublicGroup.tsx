import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useMatrixChatInvites } from '@fedi/common/hooks/matrix'
import { getMatrixRoomPreview, selectGroupPreviews } from '@fedi/common/redux'
import { MatrixGroupPreview } from '@fedi/common/types'

import HoloGradient from '../components/ui/HoloGradient'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { resetToGroupChat } from '../state/navigation'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmJoinPublicGroup'
>

const ConfirmJoinPublicGroup: React.FC<Props> = ({ route, navigation }) => {
    const { groupId } = route.params

    const { t } = useTranslation()
    const { joinPublicGroup } = useMatrixChatInvites(t)

    const dispatch = useAppDispatch()

    const [isJoiningGroup, setIsJoiningGroup] = useState(false)
    const [previewGroup, setPreviewGroup] = useState<
        MatrixGroupPreview | null | undefined
    >(undefined)

    const groupPreviews = useAppSelector(selectGroupPreviews)

    const handleJoinGroup = useCallback(async () => {
        setIsJoiningGroup(true)
        // For now, only public rooms can be joined by scanning
        // TODO: Implement knocking to support non-public rooms
        joinPublicGroup(groupId)
            .then(() => {
                navigation.dispatch(resetToGroupChat(groupId))
            })
            .finally(() => {
                setIsJoiningGroup(false)
            })
    }, [groupId, joinPublicGroup, navigation])

    useEffect(() => {
        const defaultGroup = groupPreviews[groupId]

        if (defaultGroup) {
            setPreviewGroup(defaultGroup)
            return
        }

        dispatch(getMatrixRoomPreview(groupId))
            .unwrap()
            .then(preview => {
                setPreviewGroup(preview)
            })
            .catch(() => {
                setPreviewGroup(null)
            })
    }, [groupPreviews, groupId, dispatch])

    return previewGroup === undefined ? null : (
        <SafeAreaContainer padding="xl" edges="notop">
            <View style={style.content}>
                <HoloGradient level="400" gradientStyle={style.icon}>
                    <Text style={style.iconText}>👋</Text>
                </HoloGradient>
                <Text h2 h2Style={style.buttonText}>
                    {previewGroup
                        ? t('feature.onboarding.welcome-to-federation', {
                              federation: previewGroup.info.name,
                          })
                        : t('feature.chat.join-a-group')}
                </Text>
                <Text medium style={style.messageNotice}>
                    {t('feature.chat.public-group-notice')}
                </Text>
            </View>
            <Button onPress={handleJoinGroup} loading={isJoiningGroup}>
                {t('words.continue')}
            </Button>
        </SafeAreaContainer>
    )
}

const style = StyleSheet.create({
    content: {
        display: 'flex',
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
    },
    buttonText: {
        textAlign: 'center',
    },
    icon: {
        width: 64,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 64,
    },
    iconText: {
        fontSize: 24,
    },
    messageNotice: {
        textAlign: 'center',
    },
})

export default ConfirmJoinPublicGroup
