import React from 'react'
import { useTranslation } from 'react-i18next'

import { styled } from '../../styles'
import { Button } from '../Button'
import { Column } from '../Flex'
import * as Layout from '../Layout'
import { Text } from '../Text'

type Props = {
    roomName?: string | null
    onGoBack?: () => void
}

export const KnockPendingView: React.FC<Props> = ({ roomName, onGoBack }) => {
    const { t } = useTranslation()

    return (
        <Layout.Root>
            <Layout.Header back={onGoBack} />
            <Layout.Content>
                <Column grow center gap="md">
                    <IconCircle>
                        <Text css={{ fontSize: 28 }}>⏳</Text>
                    </IconCircle>
                    <Text variant="h2" weight="medium" center>
                        {t('feature.chat.request-to-join-pending')}
                    </Text>
                    {roomName && (
                        <Text weight="bold" center>
                            {roomName}
                        </Text>
                    )}
                    <Text center>
                        {t('feature.chat.request-to-join-pending-description')}
                    </Text>
                </Column>
                {onGoBack && (
                    <Column fullWidth>
                        <Button
                            width="full"
                            variant="secondary"
                            onClick={onGoBack}>
                            {t('phrases.go-back')}
                        </Button>
                    </Column>
                )}
            </Layout.Content>
        </Layout.Root>
    )
}

const IconCircle = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: '100%',
    fediGradient: 'sky',
})
