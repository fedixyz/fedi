import Image from 'next/image'
import React from 'react'
import { useTranslation } from 'react-i18next'

import holoShield from '@fedi/common/assets/images/holo-shield.png'

import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { ContentBlock } from '../ContentBlock'
import { Column } from '../Flex'
import * as Layout from '../Layout'
import { Text } from '../Text'

type Props = {
    title: React.ReactNode
    formattedAmount?: React.ReactNode
    description?: React.ReactNode
    buttonText?: string
    onClick(): void
}

export const SuccessShield = ({
    title,
    formattedAmount,
    description,
    buttonText,
    onClick,
}: Props) => {
    const { t } = useTranslation()

    return (
        <ContentBlock>
            <Layout.Root>
                <Content centered>
                    <Column center gap="lg">
                        <Image src={holoShield} alt="" width={140} priority />
                        <Column center gap="md">
                            <Text variant="h2" weight="bold" center>
                                {title}
                            </Text>
                            {formattedAmount && (
                                <Text weight="bold" center>
                                    {formattedAmount}
                                </Text>
                            )}
                            {description && (
                                <Text
                                    center
                                    css={{ color: theme.colors.darkGrey }}>
                                    {description}
                                </Text>
                            )}
                        </Column>
                    </Column>
                </Content>
                <Layout.Actions>
                    <Button width="full" onClick={onClick}>
                        {buttonText ?? t('words.done')}
                    </Button>
                </Layout.Actions>
            </Layout.Root>
        </ContentBlock>
    )
}

const Content = styled(Layout.Content, {
    background: `linear-gradient(180deg, ${theme.colors.offWhite100} 0%, ${theme.colors.white} 100%)`,
})
