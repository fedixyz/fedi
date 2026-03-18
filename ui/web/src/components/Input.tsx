import * as RadixLabel from '@radix-ui/react-label'
import React, { useCallback, useState } from 'react'

import { styled, theme } from '../styles'
import { Text } from './Text'

interface CustomProps {
    value: string
    label?: React.ReactNode
    placeholder?: string
    disabled?: boolean
    width?: 'auto' | 'full'
    textOverflow?: 'clip' | 'ellipsis'
    adornment?: React.ReactNode
}

type Props = CustomProps &
    Omit<
        React.InputHTMLAttributes<HTMLInputElement>,
        keyof CustomProps | 'className'
    >

export const Input: React.FC<Props> = ({
    label,
    onFocus,
    onBlur,
    width = 'full',
    adornment,
    ...inputProps
}) => {
    const [hasFocus, setHasFocus] = useState(false)

    const handleFocus = useCallback(
        (ev: React.FocusEvent<HTMLInputElement>) => {
            setHasFocus(true)
            if (onFocus) onFocus(ev)
        },
        [onFocus],
    )

    const handleBlur = useCallback(
        (ev: React.FocusEvent<HTMLInputElement>) => {
            setHasFocus(false)
            if (onBlur) onBlur(ev)
        },
        [onBlur],
    )

    return (
        <Container width={width}>
            {label && (
                <Label>
                    <Text variant="small">{label}</Text>
                </Label>
            )}
            <InputWrap isFocused={hasFocus} isDisabled={inputProps.disabled}>
                <TextInput
                    {...inputProps}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                />
                {adornment}
            </InputWrap>
        </Container>
    )
}

const Container = styled(RadixLabel.Label, {
    display: 'inline-flex',
    flexDirection: 'column',
    textAlign: 'left',

    variants: {
        width: {
            auto: {
                width: 'auto',
            },
            full: {
                width: '100%',
            },
        },
    },
})

const Label = styled('div', {
    paddingBottom: 4,
    paddingLeft: 8,
})

const InputWrap = styled('div', {
    display: 'inline-flex',
    alignItems: 'center',
    height: 48,
    background: theme.colors.white,
    border: `2px solid ${theme.colors.lightGrey}`,
    borderRadius: 8,
    transition: 'border-color 80ms ease',

    variants: {
        isFocused: {
            true: {
                borderColor: theme.colors.night,
            },
        },
        isDisabled: {
            true: {
                background: theme.colors.extraLightGrey,
            },
        },
    },
})

const TextInput = styled('input', {
    flex: 1,
    minWidth: 60,
    height: '100%',
    padding: 12,
    border: 'none',
    background: 'none',
    boxShadow: 'none',

    '&:focus, &:active': {
        outline: 'none',
    },
    '&:disabled': {
        cursor: 'not-allowed',
    },
    '&::placeholder': {
        color: theme.colors.grey,
    },

    variants: {
        textOverflow: {
            clip: {
                textOverflow: 'clip',
            },
            ellipsis: {
                textOverflow: 'ellipsis',
            },
        },
    },
})
