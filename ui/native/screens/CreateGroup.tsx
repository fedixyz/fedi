import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { createMatrixRoom, selectMatrixRoom } from '@fedi/common/redux'
import { ChatType } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'

import Avatar, { AvatarSize } from '../components/ui/Avatar'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('CreateGroup')

export type Props = NativeStackScreenProps<RootStackParamList, 'CreateGroup'>

const CreateGroup: React.FC<Props> = ({ navigation, route }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const defaultGroup = route.params?.defaultGroup || undefined
    const dispatch = useAppDispatch()
    const [groupName, setGroupName] = useState<string>(
        t('feature.chat.new-group'),
    )
    const [creatingGroup, setCreatingGroup] = useState<boolean>(false)
    const [pendingRoomId, setPendingRoomId] = useState<string | null>(null)
    const [broadcastOnly, setBroadcastOnly] = useState<boolean>(false)
    const [isPublic, setIsPublic] = useState<boolean>(false)
    const toast = useToast()

    const loadedRoom = useAppSelector(
        s => pendingRoomId && selectMatrixRoom(s, pendingRoomId),
    )

    // Forces default groups to be broadcast-only & public
    // TODO: support nonbroadcast/nonpublic default groups
    useEffect(() => {
        if (defaultGroup === true) {
            setBroadcastOnly(true)
            setIsPublic(true)
        }
    }, [defaultGroup])

    // Upon creating a room, we wait for the new room
    // to show up in the room list before trying to navigate
    useEffect(() => {
        const handleRoomLoaded = async () => {
            if (!loadedRoom) return
            log.info('Group created', loadedRoom)
            navigation.replace('ChatRoomConversation', {
                roomId: loadedRoom.id,
                chatType: ChatType.group,
            })
            setCreatingGroup(false)
        }
        if (loadedRoom) handleRoomLoaded()
    }, [loadedRoom, navigation])

    const handleCreateGroup = useCallback(async () => {
        setCreatingGroup(true)
        try {
            const { roomId } = await dispatch(
                createMatrixRoom({
                    name: groupName,
                    broadcastOnly,
                    isPublic,
                }),
            ).unwrap()
            setPendingRoomId(roomId)
        } catch (error) {
            log.error('group create failed', error)
            toast.error(t, error)
        }
    }, [broadcastOnly, dispatch, groupName, isPublic, toast, t])

    const icon = useMemo(() => {
        return broadcastOnly ? 'SpeakerPhone' : 'SocialPeople'
    }, [broadcastOnly])

    const handleSubmit = async () => {
        if (groupName) {
            handleCreateGroup()
        }
    }

    const style = styles(theme)

    return (
        <View style={style.container}>
            <Avatar id={''} icon={icon} size={AvatarSize.md} />
            <View style={style.inputWrapper}>
                <Input
                    onChangeText={setGroupName}
                    value={groupName}
                    placeholder={`${t('feature.chat.group-name')}`}
                    returnKeyType="done"
                    containerStyle={style.textInputOuter}
                    inputContainerStyle={style.textInputInner}
                    autoCapitalize={'none'}
                    autoCorrect={false}
                />
            </View>
            <View style={style.switchWrapper}>
                <Text style={style.inputLabel}>
                    {t('feature.chat.broadcast-only')}
                </Text>
                <Switch
                    value={broadcastOnly}
                    onValueChange={value => {
                        // for now default groups must be public
                        if (defaultGroup === true) return
                        setBroadcastOnly(value)
                    }}
                />
            </View>
            <View style={style.switchWrapper}>
                <Text style={style.inputLabel}>{t('words.public')}</Text>
                <Switch
                    value={isPublic}
                    onValueChange={value => {
                        // for now default groups must be public
                        if (defaultGroup === true) return
                        setIsPublic(value)
                    }}
                />
            </View>
            {isPublic && (
                <Text caption style={style.errorLabel}>
                    {t('feature.chat.public-group-warning')}
                </Text>
            )}
            <Button
                fullWidth
                title={t('phrases.save-changes')}
                onPress={handleSubmit}
                loading={creatingGroup}
                disabled={!groupName || creatingGroup}
                containerStyle={style.button}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.lg,
        },
        button: {
            marginTop: 'auto',
        },
        errorLabel: {
            textAlign: 'left',
            marginTop: theme.spacing.sm,
            color: theme.colors.red,
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
        switchWrapper: {
            marginTop: theme.spacing.xl,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 10,
        },
        textInputInner: {
            // borderBottomWidth: 0,
            textAlignVertical: 'center',
            borderColor: theme.colors.primaryVeryLight,
            borderWidth: 1,
            borderRadius: theme.borders.defaultRadius,
            padding: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
        },
        textInputOuter: {
            width: '100%',
        },
    })

export default CreateGroup
