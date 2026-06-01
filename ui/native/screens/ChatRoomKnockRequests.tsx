import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, ListRenderItem, StyleSheet, View } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    refetchMatrixRoomMembers,
    selectMatrixRoomKnockingMembers,
    selectMatrixRoomSelfPowerLevel,
} from '@fedi/common/redux'
import { MatrixPowerLevel, MatrixRoomMember } from '@fedi/common/types'
import { isPowerLevelGreaterOrEqual } from '@fedi/common/utils/matrix'

import ChatUserTile from '../components/feature/chat/ChatUserTile'
import { Column } from '../components/ui/Flex'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { type RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChatRoomKnockRequests'
>

type Action = 'accept' | 'decline'

const ChatRoomKnockRequests: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { roomId } = route.params
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()

    const knockMembers = useAppSelector(s =>
        selectMatrixRoomKnockingMembers(s, roomId),
    )
    const myPowerLevel = useAppSelector(s =>
        selectMatrixRoomSelfPowerLevel(s, roomId),
    )
    const canRespond =
        !!myPowerLevel &&
        isPowerLevelGreaterOrEqual(myPowerLevel, MatrixPowerLevel.Moderator)

    const [processingUserId, setProcessingUserId] = useState<string | null>(
        null,
    )

    // Membership changes (knock/leave/join) don't propagate via the
    // timeline subscription; refetch on mount and after any response
    // so the admin sees fresh state.
    useEffect(() => {
        dispatch(refetchMatrixRoomMembers({ fedimint, roomId })).catch(() => {})
    }, [dispatch, fedimint, roomId])

    const handleResponse = useCallback(
        async (action: Action, userId: string) => {
            setProcessingUserId(userId)
            try {
                if (action === 'accept') {
                    await fedimint.matrixRoomInviteUserById({ roomId, userId })
                } else {
                    await fedimint.matrixRoomKickUser({
                        roomId,
                        userId,
                        reason: null,
                    })
                }
                toast.show({
                    content: t(
                        action === 'accept'
                            ? 'feature.chat.knock-accepted'
                            : 'feature.chat.knock-declined',
                    ),
                    status: 'success',
                })
                dispatch(refetchMatrixRoomMembers({ fedimint, roomId })).catch(
                    () => {},
                )
            } catch {
                toast.error(t, 'errors.unknown-error')
            } finally {
                setProcessingUserId(null)
            }
        },
        [dispatch, fedimint, roomId, t, toast],
    )

    const style = styles(theme)

    const renderKnockRequest: ListRenderItem<MatrixRoomMember> = ({ item }) => {
        const isProcessing = processingUserId === item.id
        return (
            <View style={style.knockCard}>
                <ChatUserTile
                    user={item}
                    selectUser={() => {}}
                    disabled
                    showSuffix
                />
                <View style={style.actionButtons}>
                    <Button
                        testID="KnockRequestAccept"
                        size="sm"
                        onPress={() => handleResponse('accept', item.id)}
                        loading={isProcessing}
                        disabled={isProcessing}
                        buttonStyle={style.actionButton}
                        containerStyle={style.buttonContainer}>
                        {t('feature.chat.accept-knock')}
                    </Button>
                    <Button
                        testID="KnockRequestDecline"
                        size="sm"
                        type="outline"
                        onPress={() => handleResponse('decline', item.id)}
                        loading={isProcessing}
                        disabled={isProcessing}
                        buttonStyle={style.actionButton}
                        containerStyle={style.buttonContainer}>
                        {t('feature.chat.decline-knock')}
                    </Button>
                </View>
            </View>
        )
    }

    if (!canRespond) {
        return (
            <Column center grow gap="md">
                <Text style={style.emptyText}>
                    {t('feature.chat.knock-requests-no-permission')}
                </Text>
            </Column>
        )
    }

    if (knockMembers.length === 0) {
        return (
            <Column center grow gap="md">
                <Text testID="NoKnockRequestsEmpty" style={style.emptyText}>
                    {t('feature.chat.no-knock-requests')}
                </Text>
            </Column>
        )
    }

    return (
        <Column grow fullWidth style={style.container}>
            <FlatList
                testID="KnockRequestsList"
                data={knockMembers}
                renderItem={renderKnockRequest}
                keyExtractor={(item: MatrixRoomMember) => item.id}
                contentContainerStyle={style.listContainer}
                showsVerticalScrollIndicator={false}
            />
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.lg,
        },
        listContainer: {
            paddingBottom: theme.spacing.lg,
        },
        knockCard: {
            paddingVertical: theme.spacing.sm,
        },
        actionButtons: {
            flexDirection: 'row',
            gap: theme.spacing.sm,
            paddingTop: theme.spacing.xs,
            paddingHorizontal: theme.spacing.sm,
        },
        buttonContainer: {
            flex: 1,
        },
        actionButton: {
            paddingHorizontal: theme.spacing.sm,
        },
        emptyText: {
            textAlign: 'center',
            color: theme.colors.darkGrey,
        },
    })

export default ChatRoomKnockRequests
