import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, ListRenderItem, StyleSheet } from 'react-native'

import { DEEPLINK_HOSTS, LINK_PATH } from '@fedi/common/constants/linking'
import { useFedimint } from '@fedi/common/hooks/fedimint'
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
import Flex from '../components/ui/Flex'
import HoloLoader from '../components/ui/HoloLoader'
import KeyboardAwareWrapper from '../components/ui/KeyboardAwareWrapper'
import { PressableIcon } from '../components/ui/PressableIcon'
import QRScreen from '../components/ui/QRScreen'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { MatrixUser } from '../types'
import type { NavigationHook, RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'ChatRoomInvite'>

// Full-string match for an npub user ID: optional '@', 'npub1' + 58 [a-z0-9], and optional ':domain.tld' homeserver suffix (TLD ≥ 2).
const USER_ID_RE = /^@?npub1[a-z0-9]{58}(:[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})?$/

const ChatRoomInvite: React.FC<Props> = ({ route }: Props) => {
    const { roomId } = route.params
    const navigation = useNavigation<NavigationHook>()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { error } = useToast()
    const { setQuery, searchedUsers, isSearching, searchError } =
        useMatrixUserSearch()
    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const userMap = useAppSelector(s => selectMatrixRoomMemberMap(s, roomId))
    const [invitingUsers, setInvitingUsers] = useState<string[]>([])
    const roomName = useMemo(() => room?.name ?? '', [room])
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const [inputValue, setInputValue] = useState('')

    const inviteUser = useCallback(
        async (userId: string) => {
            setInvitingUsers(users => [...users, userId])
            try {
                await dispatch(
                    inviteUserToMatrixRoom({ fedimint, roomId, userId }),
                ).unwrap()
            } catch (err) {
                error(t, 'errors.unknown-error')
            }
            setInvitingUsers(users => users.filter(id => id !== userId))
        },
        [setInvitingUsers, dispatch, roomId, error, t, fedimint],
    )

    const selectUser = useCallback(
        async (userId: string) => {
            await inviteUser(userId)
        },
        [inviteUser],
    )

    const renderEmpty = useCallback(() => {
        const style = styles(theme)
        return searchError ? (
            <Flex grow center style={style.empty}>
                <Text color={theme.colors.primaryLight}>
                    {formatErrorMessage(
                        t,
                        searchError,
                        'errors.chat-unavailable',
                    )}
                </Text>
            </Flex>
        ) : isSearching ? (
            <Flex grow align="center" style={style.loader}>
                <HoloLoader size={48} />
            </Flex>
        ) : (
            <Flex grow center style={style.empty}>
                <Text color={theme.colors.primaryLight}>
                    {inputValue === ''
                        ? t('feature.chat.enter-a-username')
                        : t('feature.omni.search-no-results', {
                              query: inputValue,
                          })}
                </Text>
            </Flex>
        )
    }, [isSearching, searchError, theme, t, inputValue])

    if (!matrixAuth || !room) return null

    const style = styles(theme)

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

    const normalizeNpub = (s: string): string => {
        const trimmed = s.trim().toLowerCase()
        const noAt = trimmed.replace(/^@/, '')
        return noAt.split(':')[0] // strip :server suffix if present
    }

    const parseUserFromUniversalLink = (input: string): string | null => {
        try {
            const url = new URL(input.trim())
            const hostOk = DEEPLINK_HOSTS.some(
                h => url.hostname === h || url.hostname === `www.${h}`,
            )
            if (!hostOk || url.pathname !== LINK_PATH) return null

            const id = url.searchParams.get('id')
            if (!id) return null

            const decoded = decodeURIComponent(id).trim()
            return decoded.startsWith('@')
                ? decoded
                : `@${decoded.replace(/^@?/, '')}`
        } catch {
            return null
        }
    }

    const handleQueryChange = (text: string) => {
        setInputValue(text)
        const parsed = extractUserIdFromInput(text)
        setQuery(parsed ?? text)
    }

    const extractUserIdFromInput = (input: string): string | null => {
        if (typeof input !== 'string' || input.trim().length === 0) return null
        const trimmed = input.trim()

        const fromLink = parseUserFromUniversalLink(trimmed)
        if (fromLink) return fromLink

        if (USER_ID_RE.test(trimmed)) return `@${normalizeNpub(trimmed)}`
        return null
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
            <SafeAreaContainer style={style.container} edges="notop">
                <Flex align="center" fullWidth>
                    <ChatSettingsAvatar room={room} />
                    <Text bold style={style.inputLabel}>
                        {t('feature.chat.invite-to-group')}
                    </Text>
                    <Input
                        onChangeText={handleQueryChange}
                        value={inputValue}
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
                </Flex>
                {searchContent}
            </SafeAreaContainer>
        </KeyboardAwareWrapper>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingLeft: theme.spacing.xl,
            paddingRight: theme.spacing.xl,
            width: '100%',
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
            padding: theme.spacing.xl,
        },
        empty: {
            marginTop: theme.spacing.md,
            borderWidth: 1,
            padding: theme.spacing.xxl,
            borderColor: theme.colors.primaryVeryLight,
            borderRadius: theme.borders.defaultRadius,
            borderStyle: 'dashed',
        },
    })

export default ChatRoomInvite
