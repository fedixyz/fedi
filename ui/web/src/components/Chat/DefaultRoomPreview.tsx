import Link from 'next/link'

import ArrowRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import { Community, LoadedFederation, MatrixRoom } from '@fedi/common/types'
import stringUtils from '@fedi/common/utils/StringUtils'

import { chatRoomRoute } from '../../constants/routes'
import { styled, theme } from '../../styles'
import { FederationAvatar } from '../FederationAvatar'
import { Icon } from '../Icon'
import { Text } from '../Text'

export function DefaultRoomPreview({
    room,
    federationOrCommunity,
}: {
    room: MatrixRoom
    federationOrCommunity: Community | LoadedFederation
}) {
    return (
        <DefaultRoomContainer href={chatRoomRoute(room.id)}>
            <FederationAvatar
                federation={federationOrCommunity}
                size="sm"
                css={{ flexShrink: 0 }}
            />
            <DefaultRoomText>
                <Text variant="body" weight="bold">
                    {stringUtils.truncateString(room.name, 25)}
                </Text>
                {room.preview && (
                    <Text variant="small">
                        {stringUtils.truncateString(
                            stringUtils.stripNewLines(
                                'body' in room.preview.content
                                    ? room.preview.content.body
                                    : '',
                            ),
                            25,
                        )}
                    </Text>
                )}
            </DefaultRoomText>
            <NewsItemArrow>
                <Icon icon={ArrowRightIcon} />
            </NewsItemArrow>
        </DefaultRoomContainer>
    )
}

const DefaultRoomContainer = styled(Link, {
    alignItems: 'center',
    background: theme.colors.offWhite100,
    borderRadius: 20,
    boxSizing: 'border-box',
    color: theme.colors.night,
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
