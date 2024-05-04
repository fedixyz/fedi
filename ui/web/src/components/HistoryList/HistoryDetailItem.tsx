import React from 'react'
import { useTranslation } from 'react-i18next'

import CopyIcon from '@fedi/common/assets/svgs/copy.svg'
import { useToast } from '@fedi/common/hooks/toast'
import stringUtils from '@fedi/common/utils/StringUtils'

import { styled, theme } from '../../styles'
import { Icon } from '../Icon'
import { Text } from '../Text'

interface BaseProps {
    label: React.ReactNode
    onClick?: () => void
}

interface StringProps extends BaseProps {
    value: string
    truncated?: boolean
    copyable?: boolean
    copiedMessage?: string
}

interface ReactNodeProps extends BaseProps {
    value: React.ReactElement
}

export type HistoryDetailItemProps = StringProps | ReactNodeProps

const isStringProps = (props: HistoryDetailItemProps): props is StringProps =>
    typeof props.value === 'string'

export const HistoryDetailItem: React.FC<HistoryDetailItemProps> = props => {
    const { t } = useTranslation()
    const toast = useToast()

    let valueEl: React.ReactNode
    if (isStringProps(props)) {
        valueEl = (
            <Text variant="caption">
                {props.truncated
                    ? stringUtils.truncateMiddleOfString(props.value, 5)
                    : props.value}
            </Text>
        )
        if (props.copyable) {
            valueEl = (
                <CopyButton
                    onClick={() => {
                        try {
                            navigator.clipboard.writeText(props.value)
                            toast.show(
                                props.copiedMessage ||
                                    t('phrases.copied-to-clipboard'),
                            )
                        } catch (err) {
                            toast.error(t, err, 'errors.unknown-error')
                        }
                    }}>
                    {valueEl}
                    <Icon icon={CopyIcon} size="xs" />
                </CopyButton>
            )
        }
    } else {
        valueEl = props.value
    }

    return (
        <Container
            as={props.onClick ? 'button' : undefined}
            onClick={props.onClick}>
            <Text variant="caption" weight="medium">
                {props.label}
            </Text>
            {valueEl}
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: theme.fontSizes.small,

    '&:not(:last-child)': {
        borderBottom: `1px solid ${theme.colors.extraLightGrey}`,
    },

    '> div:first-child': {
        textAlign: 'left',
        fontWeight: theme.fontWeights.medium,
    },

    '> div:last-child': {
        flex: 1,
        minWidth: 0,
        textAlign: 'right',
    },

    variants: {
        ellipsize: {
            true: {
                '> div:last-child': {
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                },
            },
        },
    },
})

const CopyButton = styled('button', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
})
