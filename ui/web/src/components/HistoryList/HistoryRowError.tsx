import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import ErrorIcon from '@fedi/common/assets/svgs/error.svg'
import { formatErrorMessage } from '@fedi/common/utils/format'

import { styled, theme } from '../../styles'
import { Dialog } from '../Dialog'
import { Icon } from '../Icon'
import { Text } from '../Text'

interface Props {
    error: unknown
    item: unknown
}

export const HistoryRowError: React.FC<Props> = ({ error, item }) => {
    const { t } = useTranslation()
    const [isShowingDetails, setIsShowingDetails] = useState(false)

    return (
        <Container onClick={() => setIsShowingDetails(true)}>
            <Icon icon={ErrorIcon} size={32} />
            <Message>
                <Text variant="caption" weight="medium">
                    {t('errors.history-render-error')}
                </Text>
                <Text variant="small" css={{ color: theme.colors.darkGrey }}>
                    {t('phrases.click-for-more-details')}
                </Text>
            </Message>

            <Dialog
                open={isShowingDetails}
                onOpenChange={setIsShowingDetails}
                size="lg">
                <Text>
                    {formatErrorMessage(t, error, 'errors.unknown-error')}
                </Text>
                <ErrorJSON>{JSON.stringify(item, null, 2)}</ErrorJSON>
            </Dialog>
        </Container>
    )
}

const Container = styled('button', {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    transition: 'background-color 100ms ease',

    '&:hover, &:focus': {
        background: 'rgba(0, 0, 0, 0.04)',
    },

    '& svg': {
        color: theme.colors.red,
    },
})

const Message = styled('div', {
    flex: 1,
    minWidth: 0,
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
})

const ErrorJSON = styled('pre', {
    maxWidth: '100%',
    overflow: 'auto',
    padding: 8,
    marginTop: 16,
    background: theme.colors.extraLightGrey,
    borderRadius: 8,
})
