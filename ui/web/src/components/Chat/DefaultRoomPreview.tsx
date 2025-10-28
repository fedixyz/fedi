import Link from 'next/link'

import ChatIcon from '@fedi/common/assets/svgs/chat.svg'
import ArrowRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import { MatrixRoom } from '@fedi/common/types'
import stringUtils from '@fedi/common/utils/StringUtils'

import { chatRoomRoute } from '../../constants/routes'
import { styled, theme } from '../../styles'
import { Icon } from '../Icon'
import { Text } from '../Text'

export function DefaultRoomPreview({ room }: { room: MatrixRoom }) {
    return (
        <DefaultRoomContainer href={chatRoomRoute(room.id)}>
            <IconContainer>
                <Icon icon={ChatIcon} />
            </IconContainer>
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
                <Icon
                    icon={ArrowRightIcon}
                    color={theme.colors.grey.toString()}
                />
            </NewsItemArrow>
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
