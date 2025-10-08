import React, { useMemo } from 'react'

import { MatrixEvent, MatrixGroupPreview } from '@fedi/common/types'
import { makeMatrixEventGroups } from '@fedi/common/utils/matrix'

import { chatRoute } from '../../constants/routes'
import { styled } from '../../styles'
import { Avatar } from '../Avatar'
import * as Layout from '../Layout'
import { Text } from '../Text'
import { ChatEventCollection } from './ChatEventCollection'

interface Props {
    id: string
    preview: MatrixGroupPreview
}

export const ChatPreviewConversation: React.FC<Props> = ({ id, preview }) => {
    const timeline = preview.timeline || []
    const events = timeline.filter((item): item is MatrixEvent => {
        return item !== null
    })
    const eventGroups = useMemo(
        () => makeMatrixEventGroups(events, 'desc'),
        [events],
    )

    return (
        <Layout.Root>
            <Layout.Header back={chatRoute}>
                <HeaderContent>
                    <Avatar size="sm" id={id} name={preview.info.name} />
                    <Text weight="medium">{preview.info.name}</Text>
                </HeaderContent>
            </Layout.Header>
            <Layout.Content fullWidth>
                <Messages>
                    {eventGroups.map(collection => (
                        <ChatEventCollection
                            key={collection[0][0].id}
                            roomId={id}
                            collection={collection}
                            showUsernames={true}
                        />
                    ))}
                </Messages>
            </Layout.Content>
        </Layout.Root>
    )
}

const HeaderContent = styled('div', {
    display: 'flex',
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
})

const Messages = styled('div', {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column-reverse',
    padding: 16,
    overflow: 'auto',
})
