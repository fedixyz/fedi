import React from 'react'
import { useTranslation } from 'react-i18next'

import { MatrixRoomMember } from '@fedi/common/types'
import { getUserSuffix } from '@fedi/common/utils/matrix'

import { styled, theme } from '../../styles'
import { Column, Row } from '../Flex'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'

interface Props {
    member: MatrixRoomMember
    onClick: (userId: string) => void
}

export const ChatPendingRequestTile: React.FC<Props> = ({
    member,
    onClick,
}) => {
    const { t } = useTranslation()
    const suffix = getUserSuffix(member.id)

    return (
        <Container
            align="center"
            gap="md"
            fullWidth
            onClick={() => onClick(member.id)}>
            <AvatarWrapper>
                <ChatAvatar user={member} size="md" />
                <StatusDot />
            </AvatarWrapper>
            <Column shrink>
                <Row align="center">
                    <NameText weight="bold" ellipsize>
                        {member.displayName || member.id}
                    </NameText>
                    <SuffixText variant="caption" weight="bold">
                        {suffix}
                    </SuffixText>
                </Row>
                <SubtitleText variant="small">
                    {t('feature.chat.requested-to-join')}
                </SubtitleText>
            </Column>
        </Container>
    )
}

const Container = styled(Row, {
    backgroundColor: theme.colors.orange200,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    cursor: 'pointer',
})

const AvatarWrapper = styled('div', {
    position: 'relative',
    flexShrink: 0,
})

const StatusDot = styled('div', {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: '50%',
    border: `2px solid ${theme.colors.white}`,
    backgroundColor: theme.colors.orange,
})

const NameText = styled(Text, {
    flexShrink: 1,
    paddingRight: theme.spacing.xs,
})

const SuffixText = styled(Text, {
    color: theme.colors.grey,
    flexShrink: 0,
})

const SubtitleText = styled(Text, {
    color: theme.colors.grey,
})
