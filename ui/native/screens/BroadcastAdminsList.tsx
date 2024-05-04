import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, CheckBox, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, FlatList, ListRenderItem, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    fetchChatGroupMembersList,
    removeAdminFromChatGroup,
    selectActiveFederationId,
} from '@fedi/common/redux'
import { ChatMember } from '@fedi/common/types'
import { XmppMemberRole } from '@fedi/common/utils/XmlUtils'
import { makeLog } from '@fedi/common/utils/log'

import MemberItem from '../components/feature/chat/MemberItem'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('BroadcastAdminsList')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'BroadcastAdminsList'
>

const BroadcastAdminsList: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const { groupId } = route.params
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const isFocused = useIsFocused()
    const toast = useToast()
    const [admins, setAdmins] = useState<ChatMember[]>([])
    const style = styles(theme)

    const refreshAdminList = useCallback(async () => {
        if (activeFederationId) {
            const groupParticipants = await dispatch(
                fetchChatGroupMembersList({
                    federationId: activeFederationId,
                    groupId,
                    role: XmppMemberRole.participant,
                }),
            ).unwrap()
            setAdmins(groupParticipants)
        }
    }, [activeFederationId, dispatch, groupId])

    useEffect(() => {
        if (isFocused) {
            refreshAdminList()
        }
    }, [isFocused, refreshAdminList])

    const confirmRemoveAdmin = async (member: ChatMember) => {
        try {
            if (activeFederationId) {
                await dispatch(
                    removeAdminFromChatGroup({
                        federationId: activeFederationId,
                        groupId,
                        memberId: member.id,
                    }),
                ).unwrap()
                refreshAdminList()
                toast.show({
                    content: t('feature.chat.removed-admin-from-group', {
                        username: member.username,
                    }),
                    status: 'success',
                })
            }
        } catch (error) {
            log.error('confirmRemoveAdmin', error)
            toast.error(t, error)
        }
    }

    const handleRemoveAdmin = (member: ChatMember) => {
        Alert.alert(
            t('phrases.please-confirm'),
            t('feature.chat.confirm-remove-admin-from-group', {
                username: member.username,
            }),
            [
                {
                    text: t('words.cancel'),
                },
                {
                    text: t('words.yes'),
                    onPress: async () => confirmRemoveAdmin(member),
                },
            ],
        )
    }

    const renderMember: ListRenderItem<ChatMember> = ({ item }) => {
        return (
            <MemberItem
                member={item}
                selectMember={handleRemoveAdmin}
                actionIcon={
                    <CheckBox
                        checked={true}
                        onPress={() => handleRemoveAdmin(item)}
                    />
                }
            />
        )
    }

    return (
        <View style={style.container}>
            <Text h2 h2Style={style.headerText}>
                {t('feature.chat.admin-settings')}
            </Text>
            <Text caption medium style={style.instructions}>
                {t('feature.chat.admin-settings-instructions')}
            </Text>
            <View style={style.membersListContainer}>
                <FlatList
                    data={admins}
                    renderItem={renderMember}
                    keyExtractor={(item: ChatMember) => `${item.id}`}
                    style={style.membersListContainer}
                />
            </View>
            <Button
                fullWidth
                containerStyle={style.buttonContainer}
                title={t('feature.chat.add-admin')}
                onPress={() =>
                    navigation.navigate('AddBroadcastAdmin', {
                        groupId,
                    })
                }
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            padding: theme.spacing.xl,
        },
        headerText: {
            marginBottom: theme.spacing.sm,
        },
        instructions: {
            lineHeight: 20,
        },
        membersListContainer: {
            flex: 1,
        },
        buttonContainer: {
            marginTop: 'auto',
        },
    })

export default BroadcastAdminsList
