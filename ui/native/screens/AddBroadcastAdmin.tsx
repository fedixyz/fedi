import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Input, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, FlatList, ListRenderItem, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    addAdminToChatGroup,
    fetchChatGroupMembersList,
    selectActiveFederationId,
} from '@fedi/common/redux'
import { ChatMember } from '@fedi/common/types'
import { XmppMemberRole } from '@fedi/common/utils/XmlUtils'
import { makeLog } from '@fedi/common/utils/log'

import MemberItem from '../components/feature/chat/MemberItem'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('AddBroadcastAdmin')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'AddBroadcastAdmin'
>

const AddBroadcastAdmin: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const { groupId } = route.params
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const toast = useToast()
    const [usernameFilter, setUsernameFilter] = useState<string>('')
    const [visitors, setVisitors] = useState<ChatMember[]>([])
    const style = styles(theme)

    // filter out members if usernameFilter has text to filter with
    const filteredMembers = usernameFilter
        ? visitors.filter(m => m.username.includes(usernameFilter))
        : visitors

    const refreshVisitorList = useCallback(async () => {
        if (activeFederationId) {
            const groupVisitors = await dispatch(
                fetchChatGroupMembersList({
                    federationId: activeFederationId,
                    groupId,
                    role: XmppMemberRole.visitor,
                }),
            ).unwrap()
            setVisitors(groupVisitors)
        }
    }, [activeFederationId, dispatch, groupId])

    useEffect(() => {
        refreshVisitorList()
    }, [refreshVisitorList])

    const confirmAddAdmin = async (member: ChatMember) => {
        try {
            if (activeFederationId) {
                await dispatch(
                    addAdminToChatGroup({
                        federationId: activeFederationId,
                        groupId,
                        memberId: member.id,
                    }),
                ).unwrap()
                toast.show({
                    content: t('feature.chat.added-admin-to-group', {
                        username: member.username,
                    }),
                    status: 'success',
                })
                navigation.goBack()
            }
        } catch (error) {
            log.error('confirmAddAdmin', error)
            toast.error(t, error)
        }
    }

    const handleAddAdmin = async (member: ChatMember) => {
        Alert.alert(
            t('phrases.please-confirm'),
            t('feature.chat.confirm-add-admin-to-group', {
                username: member.username,
            }),
            [
                {
                    text: t('words.cancel'),
                },
                {
                    text: t('words.yes'),
                    onPress: () => confirmAddAdmin(member),
                },
            ],
        )
    }

    const renderMember: ListRenderItem<ChatMember> = ({ item }) => {
        return <MemberItem member={item} selectMember={handleAddAdmin} />
    }

    return (
        <View style={style.container}>
            <View style={style.filterMembersContainer}>
                <Input
                    onChangeText={setUsernameFilter}
                    value={usernameFilter}
                    placeholder={`${t(
                        'feature.chat.type-to-search-members',
                    )}...`}
                    returnKeyType="done"
                    containerStyle={style.filterMembersTextInputOuter}
                    inputContainerStyle={style.filterMembersTextInputInner}
                    style={style.filterMembersTextInput}
                    autoCapitalize={'none'}
                    autoCorrect={false}
                    autoFocus
                />
                {/* TODO: implement Add Admin by scanning their member code */}
                {/* <Pressable
                    onPress={() => navigation.navigate('ScanMemberCode')}
                    hitSlop={5}>
                    <SvgImage name="Scan" />
                </Pressable> */}
            </View>
            <View style={style.membersListContainer}>
                <FlatList
                    data={filteredMembers}
                    renderItem={renderMember}
                    keyExtractor={(item: ChatMember) => `${item.id}`}
                    style={style.membersList}
                />
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            paddingVertical: theme.spacing.xl,
        },
        filterMembersContainer: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.xl,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.grey,
        },
        filterLabel: {
            textAlign: 'left',
        },
        filterMembersTextInputOuter: {
            flex: 1,
            height: 40,
        },
        filterMembersTextInputInner: {
            borderBottomWidth: 0,
        },
        filterMembersTextInput: {
            fontSize: 16,
        },
        membersListContainer: {
            padding: theme.spacing.xl,
        },
        membersList: {},
    })

export default AddBroadcastAdmin
