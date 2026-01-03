import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { selectMatrixRoom, setMatrixRoomName } from '@fedi/common/redux'

import { fedimint } from '../bridge'
import { ChatSettingsAvatar } from '../components/feature/chat/ChatSettingsAvatar'
import HoloLoader from '../components/ui/HoloLoader'
import KeyboardAwareWrapper from '../components/ui/KeyboardAwareWrapper'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { resetToChatSettings } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'EditGroup'>

const EditGroup: React.FC<Props> = ({ navigation, route }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const { roomId } = route.params
    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const [groupName, setGroupName] = useState<string>(room?.name || '')
    const [editingGroupName, setEditingGroupName] = useState<boolean>(false)
    const toast = useToast()

    const style = styles(theme)

    const handleEditRoomName = useCallback(async () => {
        if (!room || !groupName) return
        setEditingGroupName(true)
        try {
            await dispatch(
                setMatrixRoomName({
                    fedimint,
                    roomId: room.id,
                    name: groupName,
                }),
            ).unwrap()
            navigation.dispatch(resetToChatSettings(room.id))
        } catch (err) {
            toast.error(t, 'errors.unknown-error')
        }
        setEditingGroupName(false)
    }, [room, groupName, dispatch, navigation, toast, t])

    if (!room) return <HoloLoader />

    const isValid = groupName.length > 0 && groupName.length < 30

    return (
        <KeyboardAwareWrapper>
            <SafeAreaContainer style={style.container} edges="notop">
                <ChatSettingsAvatar room={room} />
                <View style={style.inputWrapper}>
                    <Text caption style={style.inputLabel}>
                        {t('feature.chat.group-name')}
                    </Text>
                    <Input
                        onChangeText={setGroupName}
                        value={groupName}
                        placeholder={`${t('feature.chat.group-name')}`}
                        returnKeyType="done"
                        containerStyle={style.textInputOuter}
                        inputContainerStyle={style.textInputInner}
                        autoCapitalize={'none'}
                        autoCorrect={false}
                        errorMessage={
                            groupName.length >= 30
                                ? t('errors.group-name-too-long')
                                : undefined
                        }
                        maxLength={30}
                    />
                </View>
                <Button
                    fullWidth
                    title={t('phrases.save-changes')}
                    onPress={handleEditRoomName}
                    loading={editingGroupName}
                    disabled={!isValid}
                    containerStyle={style.button}
                />
            </SafeAreaContainer>
        </KeyboardAwareWrapper>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
        },
        button: {
            marginTop: 'auto',
        },
        inputWrapper: {
            width: '100%',
            marginTop: theme.spacing.xl,
        },
        inputLabel: {
            textAlign: 'left',
            marginLeft: theme.spacing.sm,
            marginBottom: theme.spacing.xs,
        },
        textInputInner: {
            borderBottomWidth: 0,
            height: '100%',
        },
        textInputOuter: {
            width: '100%',
            borderColor: theme.colors.primaryVeryLight,
            borderWidth: 1,
            borderRadius: theme.borders.defaultRadius,
        },
    })

export default EditGroup
