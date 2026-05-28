import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect } from 'react'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import {
    getMatrixRoomPreview,
    selectGroupPreview,
    selectMatrixRoom,
} from '@fedi/common/redux'

import { Column } from '../components/ui/Flex'
import HoloLoader from '../components/ui/HoloLoader'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { resetToGroupChat } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'RoomLink'>

const RoomLink: React.FC<Props> = ({ route, navigation }) => {
    const { roomId } = route.params
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const existingRoom = useAppSelector(s => selectMatrixRoom(s, roomId))
    const preview = useAppSelector(s => selectGroupPreview(s, roomId))

    useEffect(() => {
        if (existingRoom?.roomState === 'joined') {
            navigation.dispatch(resetToGroupChat(roomId))
            return
        }
        // Routing an outstanding invite through the knock flow would 403
        // against the existing invite; render the conversation instead.
        if (existingRoom?.roomState === 'invited') {
            navigation.replace('ChatRoomConversation', { roomId })
            return
        }
        // ChatRoomConversation renders KnockPendingView for knocked rooms;
        // skip the preview fetch.
        if (existingRoom?.roomState === 'knocked') {
            navigation.replace('ChatRoomConversation', { roomId })
            return
        }
        if (preview) {
            const target = preview.info?.isPublic
                ? 'ChatRoomConversation'
                : 'ConfirmJoinPrivateGroup'
            navigation.replace(target, { roomId })
            return
        }
        dispatch(getMatrixRoomPreview({ fedimint, roomId }))
            .unwrap()
            .catch(() => {
                // Private rooms often don't expose previews; treat any
                // fetch failure as private and let the confirm screen
                // pick knock vs invite-only by the actual knock response.
                navigation.replace('ConfirmJoinPrivateGroup', { roomId })
            })
    }, [
        roomId,
        existingRoom?.roomState,
        preview,
        navigation,
        dispatch,
        fedimint,
    ])

    return (
        <Column align="center" grow>
            <HoloLoader size={28} />
        </Column>
    )
}

export default RoomLink
