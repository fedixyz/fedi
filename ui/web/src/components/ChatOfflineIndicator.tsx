import { useTranslation } from 'react-i18next'

import { styled, theme } from '../styles'
import { CircularLoader } from './CircularLoader'
import { Text } from './Text'

const Indicator = styled('div', {
    backgroundColor: '#FCDDEC', // TODO: Replace with fuschia from theme when new colors are added
    color: theme.colors.primary,
    padding: '$xs $sm',
    borderRadius: 8,
    display: 'flex',
    gap: theme.space.sm,
    alignItems: 'center',
    justifyContent: 'center',
})

export const ChatOfflineIndicator = () => {
    const { t } = useTranslation()

    return (
        <Indicator>
            <CircularLoader size={16} />
            <Text variant="small" weight="medium">
                {t('feature.chat.waiting-for-network')}
            </Text>
        </Indicator>
    )
}
