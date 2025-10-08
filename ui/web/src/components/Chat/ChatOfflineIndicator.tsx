import { useTranslation } from 'react-i18next'

import { styled, theme } from '../../styles'
import { CircularLoader } from '../CircularLoader'
import { Text } from '../Text'

export const ChatOfflineIndicator = () => {
    const { t } = useTranslation()

    return (
        <Indicator>
            <CircularLoader size={16} />
            <Text variant="small" weight="medium">
                {`${t('feature.chat.waiting-for-network')}...`}
            </Text>
        </Indicator>
    )
}

const Indicator = styled('div', {
    alignItems: 'center',
    backgroundColor: theme.colors.fuschia,
    borderRadius: 8,
    color: theme.colors.primary,
    display: 'flex',
    padding: '$xs $sm',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    position: 'fixed',
    top: '50px',
    zIndex: 10,
})
