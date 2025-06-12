import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { inviteUserToMatrixRoom, selectMatrixRoom } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { OmniInput } from '../components/feature/omni/OmniInput'
import CustomOverlay, {
    CustomOverlayContents,
} from '../components/ui/CustomOverlay'
import Flex from '../components/ui/Flex'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { ParsedFediChatUser, ParserDataType } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'ScanMemberCode'>

const log = makeLog('ScanMemberCode')

const ScanMemberCode: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const toast = useToast()
    const inviteToRoomId = route?.params?.inviteToRoomId
    const room = useAppSelector(
        s => !!inviteToRoomId && selectMatrixRoom(s, inviteToRoomId),
    )
    const roomName = room ? room.name : t('phrases.this-group')
    const isInvitation = !!inviteToRoomId
    const dispatch = useAppDispatch()
    const [scannedUser, setScannedUser] = useState<ParsedFediChatUser | null>(
        null,
    )
    const [isLoading, setIsLoading] = useState(false)

    const handleNavigate = useCallback(() => {
        return navigation.canGoBack()
            ? navigation.goBack()
            : navigation.replace('TabsNavigator', {
                  initialRouteName: 'Chat',
              })
    }, [navigation])

    const handleInviteToRoom = useCallback(
        async (roomId: string, userId: string) => {
            try {
                log.info(
                    `Inviting user to matrix room (${userId} , ${roomId}) `,
                )
                setIsLoading(true)
                await dispatch(
                    inviteUserToMatrixRoom({ roomId: roomId, userId }),
                ).unwrap()
                toast.show({
                    status: 'info',
                    content: t('words.invited'),
                })
                setIsLoading(false)
                handleNavigate()
            } catch (e) {
                toast.error(t, e)
                setIsLoading(false)
                setScannedUser(null)
            }
        },
        [setIsLoading, setScannedUser, toast, t, dispatch, handleNavigate],
    )

    const handleConfirmation = useCallback(() => {
        // this should be called, as handleConfirmation should only be
        // fired when this is an invitation scanner and when scannedUser is set
        if (!isInvitation || !scannedUser) {
            log.warn(`NOOP - NOT adding member to room due to invalid state`)
            toast.show({
                status: 'error',
                content: t('errors.failed-to-invite-to-group'),
            })
            return
        }
        handleInviteToRoom(inviteToRoomId, scannedUser.data.id)
    }, [
        toast,
        t,
        scannedUser,
        isInvitation,
        inviteToRoomId,
        handleInviteToRoom,
    ])

    const handleScannedData = useCallback(
        (parsedData: ParsedFediChatUser) => {
            if (!isInvitation) {
                // If inviteToRoomId is not set, navigate to ChatUserConversation
                return navigation.replace('ChatUserConversation', {
                    userId: parsedData.data.id,
                    displayName: parsedData.data.displayName,
                })
            } else {
                // If inviteToRoomId is set, then prompt the
                // user to confirm to invite the user to the room
                setScannedUser(parsedData)
            }
        },
        [navigation, setScannedUser, isInvitation],
    )

    const confirmationContent: CustomOverlayContents = useMemo(
        () => ({
            icon: 'Chat',
            title: t('feature.chat.confirm-add-to-group', {
                roomName,
                username: scannedUser?.data?.displayName,
            }),
            buttons: [
                {
                    text: t('phrases.go-back'),
                    onPress: () => setScannedUser(null),
                    primary: false,
                },
                {
                    text: t('words.continue'),
                    onPress: handleConfirmation,
                    primary: true,
                },
            ],
        }),
        [setScannedUser, t, handleConfirmation, roomName, scannedUser],
    )

    return (
        <Flex grow fullWidth>
            <OmniInput
                expectedInputTypes={[ParserDataType.FediChatUser]}
                onExpectedInput={handleScannedData}
                onUnexpectedSuccess={() =>
                    navigation.canGoBack()
                        ? navigation.goBack()
                        : navigation.navigate('TabsNavigator')
                }
            />
            {!!scannedUser && (
                <>
                    <CustomOverlay
                        show={!!scannedUser}
                        contents={confirmationContent}
                        loading={isLoading}
                        onBackdropPress={() => setScannedUser(null)}
                    />
                </>
            )}
        </Flex>
    )
}

export default ScanMemberCode
