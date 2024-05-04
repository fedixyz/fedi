import * as RadixCheckbox from '@radix-ui/react-checkbox'
import * as RadixLabel from '@radix-ui/react-label'
import React from 'react'

import CheckIcon from '@fedi/common/assets/svgs/check.svg'

import { styled, theme } from '../styles'
import { Icon } from './Icon'
import { Text, TextProps } from './Text'

export interface CheckboxProps {
    checked: boolean
    defaultChecked?: boolean
    disabled?: boolean
    label?: React.ReactNode
    labelTextProps?: Partial<TextProps>
    onChange?: (checked: boolean) => void
}

export const Checkbox: React.FC<CheckboxProps> = ({
    label,
    onChange,
    labelTextProps,
    ...props
}) => {
    return (
        <Root disabled={props.disabled}>
            <CheckboxRoot {...props} onCheckedChange={onChange}>
                <CheckboxIndicator>
                    <Icon size="xs" icon={CheckIcon} />
                </CheckboxIndicator>
            </CheckboxRoot>
            {label && (
                <Label disabled={props.disabled}>
                    <Text variant="caption" weight="medium" {...labelTextProps}>
                        {label}
                    </Text>
                </Label>
            )}
        </Root>
    )
}

const Root = styled(RadixLabel.Label, {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',

    variants: {
        disabled: {
            true: {
                cursor: 'not-allowed',
            },
        },
    },
})

const CheckboxRoot = styled(RadixCheckbox.Root, {
    position: 'relative',
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    width: 22,
    height: 22,
    padding: 0,
    background: theme.colors.white,
    border: `2px solid ${theme.colors.primary}`,
    borderRadius: 4,
    cursor: 'pointer',

    '&[data-state="checked"]': {
        background: theme.colors.primary,
    },

    '&[data-disabled], &:disabled': {
        opacity: 0.5,
        cursor: 'not-allowed',
    },
})

const CheckboxIndicator = styled(RadixCheckbox.Indicator, {
    display: 'block',
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: theme.colors.white,
    opacity: 0,

    '&[data-state="checked"]': {
        opacity: 1,
    },
})

const Label = styled('div', {
    flex: 1,

    variants: {
        disabled: {
            true: {
                opacity: 0.5,
            },
        },
    },
})
