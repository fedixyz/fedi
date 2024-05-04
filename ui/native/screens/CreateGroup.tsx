import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    createChatGroup,
    selectActiveFederationId,
    selectChatXmppClient,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('CreateGroup')

export type Props = NativeStackScreenProps<RootStackParamList, 'CreateGroup'>

const CreateGroup: React.FC<Props> = ({ navigation }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const xmppClient = useAppSelector(selectChatXmppClient)
    const [groupName, setGroupName] = useState<string>('')
    const [creatingGroup, setCreatingGroup] = useState<boolean>(false)
    const [broadcastOnly, setBroadcastOnly] = useState<boolean>(false)
    const toast = useToast()

    const handleCreateGroup = useCallback(async () => {
        try {
            if (!activeFederationId || !xmppClient)
                throw new Error('errors.chat-unavailable')
            setCreatingGroup(true)
            const groupId = await xmppClient.generateUniqueGroupId()

            const newGroup = await dispatch(
                createChatGroup({
                    federationId: activeFederationId,
                    id: groupId,
                    name: groupName,
                    broadcastOnly,
                }),
            ).unwrap()
            log.info('group created', newGroup)
            navigation.replace('GroupChat', { groupId })
        } catch (error) {
            log.error('group create failed', error)
            toast.error(t, error)
        }
        setCreatingGroup(false)
    }, [
        activeFederationId,
        broadcastOnly,
        dispatch,
        groupName,
        navigation,
        toast,
        xmppClient,
        t,
    ])

    const handleSubmit = async () => {
        if (groupName) {
            handleCreateGroup()
        }
    }

    return (
        <View style={styles(theme).container}>
            <SvgImage name="NewRoom" size={SvgImageSize.lg} />
            <View style={styles(theme).inputWrapper}>
                <Input
                    onChangeText={setGroupName}
                    value={groupName}
                    placeholder={`${t('feature.chat.group-name')}`}
                    returnKeyType="done"
                    containerStyle={styles(theme).textInputOuter}
                    inputContainerStyle={styles(theme).textInputInner}
                    autoCapitalize={'none'}
                    autoCorrect={false}
                />
            </View>
            <View style={styles(theme).switchWrapper}>
                <Text style={styles(theme).inputLabel}>
                    {t('feature.chat.broadcast-only')}
                </Text>
                <Switch
                    value={broadcastOnly}
                    onValueChange={value => setBroadcastOnly(value)}
                />
            </View>
            <Button
                fullWidth
                title={t('phrases.save-changes')}
                onPress={handleSubmit}
                loading={creatingGroup}
                disabled={!groupName || creatingGroup}
                containerStyle={styles(theme).button}
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
            padding: theme.spacing.xl,
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
        switchWrapper: {
            marginTop: theme.spacing.xl,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
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

export default CreateGroup
