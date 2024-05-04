import React, { useCallback } from 'react'

import { styled } from '../styles'
import { Checkbox, CheckboxProps } from './Checkbox'

interface CheckboxOption<T extends string>
    extends Omit<CheckboxProps, 'onChange' | 'checked'> {
    value: T
}

interface Props<T extends string> {
    options: CheckboxOption<T>[]
    values: T[] | undefined
    disabled?: boolean
    onChange(values: T[]): void
}

export function CheckboxGroup<T extends string>({
    options,
    values,
    onChange,
    ...props
}: Props<T>): React.ReactElement {
    const handleChange = useCallback(
        (checked: boolean, value: T) => {
            if (checked) {
                onChange([...(values || []), value])
            } else {
                onChange(values?.filter(v => v !== value) || [])
            }
        },
        [values, onChange],
    )

    return (
        <Container>
            {options.map(({ value, disabled, ...checkboxProps }) => (
                <Checkbox
                    key={value}
                    onChange={checked => handleChange(checked, value)}
                    checked={!!values?.includes(value)}
                    disabled={disabled || props.disabled}
                    {...checkboxProps}
                />
            ))}
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
})
