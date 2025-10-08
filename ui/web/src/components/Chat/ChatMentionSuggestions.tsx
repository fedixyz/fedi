import React from 'react'

import { ROOM_MENTION } from '@fedi/common/constants/matrix'
import {
    MentionSelect,
    MatrixRoomMember,
    RoomItem,
    MentionItem,
    MemberItem,
} from '@fedi/common/types'

import { styled, theme } from '../../styles'
import { Avatar } from '../Avatar'
import { Text } from '../Text'

interface Props {
    visible: boolean
    suggestions: MentionSelect[]
    onSelect: (item: MentionSelect) => void
}

const formatNpub = (id: string) => {
    const i = id.indexOf('npub')
    return i >= 0 ? id.slice(i + 4, i + 8) : id
}

export default function ChatMentionSuggestions({
    visible,
    suggestions,
    onSelect,
}: Props) {
    const includeRoom = true

    const ROOM_ITEM: RoomItem = {
        id: '@room',
        displayName: ROOM_MENTION,
        kind: 'room',
    }
    const memberItems: MemberItem[] = suggestions
        .filter((s): s is MatrixRoomMember => 'roomId' in s)
        .map(s => ({ ...s, kind: 'member' }))
    const list: MentionItem[] = includeRoom
        ? [ROOM_ITEM, ...memberItems]
        : memberItems

    if (!visible || list.length === 0) return null

    return (
        <Container>
            <Panel>
                {list.map(s => {
                    if (s.kind === 'room') {
                        return (
                            <Row
                                key="room"
                                onClick={() =>
                                    onSelect({
                                        id: '@room',
                                        displayName: ROOM_MENTION,
                                    })
                                }>
                                <Avatar size="md" id="@room" name="@room" />
                                <Meta>
                                    <Text variant="caption" weight="medium">
                                        @{ROOM_MENTION}
                                    </Text>
                                </Meta>
                            </Row>
                        )
                    }

                    const primary = s.displayName || formatNpub(s.id)
                    const avatarSrc = s.avatarUrl

                    return (
                        <Row key={s.id} onClick={() => onSelect(s)}>
                            <Avatar
                                size="md"
                                id={s.id}
                                name={primary}
                                src={avatarSrc}
                            />
                            <Meta>
                                <Text variant="caption" weight="medium">
                                    {primary}
                                </Text>
                                <Text variant="tiny" weight="normal">
                                    #{formatNpub(s.id)}
                                </Text>
                            </Meta>
                        </Row>
                    )
                })}
            </Panel>
        </Container>
    )
}
const Container = styled('div', {
    width: '100%',
    maxHeight: 280,
    overflowY: 'auto',
    backgroundColor: theme.colors.white,
    borderTop: `1px solid ${theme.colors.extraLightGrey}`,
    boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
    borderRadius: 0,
})

const Panel = styled('div', {
    width: '100%',
    backgroundColor: theme.colors.white,
    border: 'none',
    borderRadius: 0,
    boxShadow: 'none',
    maxHeight: 240,
    overflowY: 'auto',
})

const Row = styled('button', {
    width: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: 8,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 0,
    '&:hover': { backgroundColor: theme.colors.offWhite },
    '& + &': { borderTop: `1px solid ${theme.colors.extraLightGrey}` },
})

const Meta = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    minWidth: 0,
})
