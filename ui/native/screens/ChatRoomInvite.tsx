import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, ListRenderItem, StyleSheet, View } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import { useMatrixUserSearch } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import {
    inviteUserToMatrixRoom,
    selectMatrixAuth,
    selectMatrixRoom,
    selectMatrixRoomMemberMap,
} from '@fedi/common/redux'
import { RpcMatrixMembership } from '@fedi/common/types/bindings'
import { formatErrorMessage } from '@fedi/common/utils/format'

import { ChatSettingsAvatar } from '../components/feature/chat/ChatSettingsAvatar'
import ChatUserTile from '../components/feature/chat/ChatUserTile'
import HoloLoader from '../components/ui/HoloLoader'
import KeyboardAwareWrapper from '../components/ui/KeyboardAwareWrapper'
import { PressableIcon } from '../components/ui/PressableIcon'
import QRScreen from '../components/ui/QRScreen'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { MatrixUser } from '../types'
import type { NavigationHook, RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'ChatRoomInvite'>

const ChatRoomInvite: React.FC<Props> = ({ route }: Props) => {
    const { roomId } = route.params
    const navigation = useNavigation<NavigationHook>()
    const dispatch = useAppDispatch()
    const insets = useSafeAreaInsets()
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { error } = useToast()
    const { query, setQuery, searchedUsers, isSearching, searchError } =
        useMatrixUserSearch()
    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const userMap = useAppSelector(s => selectMatrixRoomMemberMap(s, roomId))
    const [invitingUsers, setInvitingUsers] = useState<string[]>([])
    const roomName = useMemo(() => room?.name ?? '', [room])
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const inviteUser = useCallback(
        async (userId: string) => {
            setInvitingUsers(users => [...users, userId])
            try {
                await dispatch(
                    inviteUserToMatrixRoom({ roomId, userId }),
                ).unwrap()
            } catch (err) {
                error(t, 'errors.unknown-error')
            }
            setInvitingUsers(users => users.filter(id => id !== userId))
        },
        [setInvitingUsers, dispatch, roomId, error, t],
    )

    const selectUser = useCallback(
        async (userId: string) => {
            await inviteUser(userId)
        },
        [inviteUser],
    )

    const renderEmpty = useCallback(() => {
        const style = styles(theme, insets)
        return searchError ? (
            <View style={style.empty}>
                <Text color={theme.colors.primaryLight}>
                    {formatErrorMessage(
                        t,
                        searchError,
                        'errors.chat-unavailable',
                    )}
                </Text>
            </View>
        ) : isSearching ? (
            <View style={style.loader}>
                <HoloLoader size={48} />
            </View>
        ) : (
            <View style={style.empty}>
                <Text color={theme.colors.primaryLight}>
                    {query === ''
                        ? t('feature.chat.enter-a-username')
                        : t('feature.omni.search-no-results', { query })}
                </Text>
            </View>
        )
    }, [query, isSearching, searchError, theme, insets, t])

    if (!matrixAuth || !room) return null

    const style = styles(theme, insets)

    // TODO: for now public rooms are reserved for the default groups use case which are auto-joined
    // so we should not need to invite anyone. When requesting to join a room is implemented we
    // can use this to display a QR code in addition to (or instead of) inviting users by ID
    if (room.isPublic && room.inviteCode) {
        return (
            <QRScreen
                title={roomName}
                qrValue={room.inviteCode}
                copyMessage={t('feature.chat.copied-group-invite-code')}
            />
        )
    }

    const getInviteText = (membership: RpcMatrixMembership | undefined) => {
        switch (membership) {
            case 'join':
                return t('words.joined')
            case 'invite':
                return t('words.invited')
            default:
                return t('words.invite')
        }
    }

    const renderUser: ListRenderItem<MatrixUser> = ({ item }) => {
        const user = userMap[item.id]
        const isDisabled =
            user?.membership === 'join' || user?.membership === 'invite'
        const inviteText = getInviteText(user?.membership)
        const color = isDisabled ? theme.colors.grey : theme.colors.blue

        const icon =
            item && invitingUsers.includes(item.id) ? (
                <HoloLoader size={24} />
            ) : (
                <Text caption style={{ color }}>
                    {inviteText}
                </Text>
            )

        return (
            <ChatUserTile
                user={item}
                disabled={isDisabled}
                selectUser={selectUser}
                actionIcon={icon}
                showSuffix
            />
        )
    }
    const searchContent = (
        <FlatList
            data={searchedUsers ?? []}
            renderItem={renderUser}
            keyExtractor={item => `${item.id}`}
            contentContainerStyle={style.listContentContainer}
            ListEmptyComponent={renderEmpty}
            keyboardDismissMode={'on-drag'}
            showsVerticalScrollIndicator={false}
            extraData={[invitingUsers]}
            keyboardShouldPersistTaps="always"
        />
    )

    return (
        <KeyboardAwareWrapper>
            <View style={style.container}>
                <View style={style.inputWrapper}>
                    <ChatSettingsAvatar room={room} />
                    <Text bold style={style.inputLabel}>
                        {t('feature.chat.invite-to-group')}
                    </Text>
                    <Input
                        onChangeText={setQuery}
                        value={query}
                        placeholder={`${t('feature.chat.enter-a-username')}`}
                        returnKeyType="done"
                        containerStyle={style.textInputOuter}
                        inputContainerStyle={style.textInputInner}
                        autoCapitalize={'none'}
                        autoCorrect={false}
                        rightIcon={
                            <PressableIcon
                                svgName="Scan"
                                onPress={() => {
                                    navigation.navigate('ScanMemberCode', {
                                        inviteToRoomId: roomId,
                                    })
                                }}
                            />
                        }
                    />
                </View>
                {searchContent}
            </View>
        </KeyboardAwareWrapper>
    )
}
const styles = (theme: Theme, insets: EdgeInsets) =>
    StyleSheet.create({
        container: {
            flex: 1,
            padding: theme.spacing.lg,
            paddingHorizontal: theme.spacing.xl + insets.left,
            paddingBottom: insets.bottom,
            width: '100%',
        },
        inputWrapper: {
            width: '100%',
            alignItems: 'center',
        },
        inputLabel: {
            alignSelf: 'flex-start',
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
            paddingRight: 0,
        },
        listContentContainer: {
            width: '100%',
        },
        loader: {
            flex: 1,
            alignItems: 'center',
            padding: theme.spacing.xl,
        },
        empty: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: theme.spacing.md,
            borderWidth: 1,
            padding: theme.spacing.xxl,
            borderColor: theme.colors.primaryVeryLight,
            borderRadius: theme.borders.defaultRadius,
            borderStyle: 'dashed',
        },
    })

export default ChatRoomInvite
