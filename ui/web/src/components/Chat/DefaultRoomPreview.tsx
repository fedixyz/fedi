import Link from 'next/link'
import { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

import {
    useJoinDefaultChat,
    useMatrixRoomPreview,
} from '@fedi/common/hooks/matrix'
import { MatrixRoom } from '@fedi/common/types'
import stringUtils from '@fedi/common/utils/StringUtils'

import { chatRoomRoute } from '../../constants/routes'
import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { Icon } from '../Icon'
import { Text } from '../Text'

export function DefaultRoomPreview({ room }: { room: MatrixRoom }) {
    const { t } = useTranslation()
    const { text, isPublicBroadcast } = useMatrixRoomPreview({
        roomId: room.id,
        t,
    })
    const { joinState, canJoin, isJoining, handleJoin } = useJoinDefaultChat(
        room.id,
        t,
    )

    return (
        <DefaultRoomContainer href={chatRoomRoute(room.id)}>
            <IconContainer>
                <Icon icon={isPublicBroadcast ? 'SpeakerPhone' : 'Chat'} />
            </IconContainer>
            <DefaultRoomText>
                <Text variant="body" weight="bold">
                    {stringUtils.truncateString(room.name, 25)}
                </Text>
                {text && <Text variant="small">{text}</Text>}
            </DefaultRoomText>
            {joinState === 'join' && canJoin ? (
                <Button
                    size="sm"
                    loading={isJoining}
                    onClick={(e: MouseEvent) => {
                        // Block the tile link's navigation; joining happens
                        // in place.
                        e.preventDefault()
                        handleJoin()
                    }}>
                    {t('words.join')}
                </Button>
            ) : joinState === 'pending' ? (
                <Button size="sm" variant="secondary" disabled>
                    {t('words.pending')}
                </Button>
            ) : (
                <NewsItemArrow data-testid="DefaultRoomPreview__chevron">
                    <Icon
                        icon="ChevronRight"
                        color={theme.colors.grey.toString()}
                    />
                </NewsItemArrow>
            )}
        </DefaultRoomContainer>
    )
}

const DefaultRoomContainer = styled(Link, {
    alignItems: 'center',
    borderRadius: 16,
    border: `solid 1px ${theme.colors.extraLightGrey}`,
    boxSizing: 'border-box',
    display: 'flex',
    gap: 10,
    overflow: 'hidden',
    padding: 15,
})

const DefaultRoomText = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    textAlign: 'left',
})

const NewsItemArrow = styled('div', {
    alignItems: 'center',
    display: 'flex',
    width: 20,
})

const IconContainer = styled('div', {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    width: 40,
    height: 40,
    flexShrink: 0,
})
