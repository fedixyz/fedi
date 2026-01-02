import React from 'react'
import { useTranslation } from 'react-i18next'

import { styled, theme } from '../../styles'
import { Text } from '../Text'

const GuardianitoHelp: React.FC = () => {
    const { t } = useTranslation()

    return (
        <Container>
            <HelpText variant="small">
                {t('feature.chat.guardianito-help-text')}
            </HelpText>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 8,
    paddingRight: 8,
    backgroundColor: theme.colors.offWhite,
    borderBottom: `1px solid ${theme.colors.extraLightGrey}`,
})

const HelpText = styled(Text, {
    color: theme.colors.grey,
})

export default GuardianitoHelp
