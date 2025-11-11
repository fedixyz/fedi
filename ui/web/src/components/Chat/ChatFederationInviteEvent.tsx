import React from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { MatrixEvent } from '@fedi/common/types'

import { Button } from '../../components/Button'
import { Row } from '../../components/Flex'
import { Text } from '../../components/Text'
import { useCopy } from '../../hooks'
import { styled, theme } from '../../styles'

interface Props {
    event: MatrixEvent<'xyz.fedi.federationInvite'>
}

export const ChatFederationInviteEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()
    const toast = useToast()

    const content = event.content
    const { copy } = useCopy()

    const handleOnCopy = () => {
        copy(content.body)
        toast.show({
            content: t('phrases.copied-to-clipboard'),
            status: 'success',
        })
    }

    return (
        <Wrapper>
            <Title variant="caption" weight="bold">
                {t('feature.chat.federation-invite')}
            </Title>
            <InviteCode variant="small" weight="normal">
                {content.body}
            </InviteCode>
            <ButtonRow>
                <Button variant="secondary" size="xs" onClick={handleOnCopy}>
                    {t('phrases.copy-invite-code')}
                </Button>
            </ButtonRow>
        </Wrapper>
    )
}

const Wrapper = styled('div', {})

const Title = styled(Text, {})

const InviteCode = styled(Text, {
    marginTop: theme.spacing.xs,
})

const ButtonRow = styled(Row, {
    marginTop: theme.spacing.md,
})
