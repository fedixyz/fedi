import React from 'react'

import { styled, theme } from '../../styles'
import { Input } from '../Input'
import { Text } from '../Text'
import { DeepLinkConfig } from './config'

interface Props {
    configs: DeepLinkConfig[]
    selectedKey: string
    paramValues: Record<string, string>
    environment: 'production' | 'staging'
    validationErrors: Record<string, string>
    onSelectScreen: (key: string) => void
    onChangeParam: (name: string, value: string) => void
    onChangeEnvironment: (env: 'production' | 'staging') => void
}

export const DeepLinkForm: React.FC<Props> = ({
    configs,
    selectedKey,
    paramValues,
    environment,
    validationErrors,
    onSelectScreen,
    onChangeParam,
    onChangeEnvironment,
}) => {
    const selectedConfig =
        configs.find(c => c.key === selectedKey) ?? configs[0]

    const onboardingConfigs = configs.filter(c => c.category === 'onboarding')
    const navConfigs = configs.filter(c => c.category === 'navigation')

    return (
        <Form>
            <FieldGroup>
                <Text variant="small">Environment</Text>
                <ToggleRow>
                    <ToggleButton
                        type="button"
                        active={environment === 'production'}
                        onClick={() => onChangeEnvironment('production')}>
                        Production
                    </ToggleButton>
                    <ToggleButton
                        type="button"
                        active={environment === 'staging'}
                        onClick={() => onChangeEnvironment('staging')}>
                        Staging
                    </ToggleButton>
                </ToggleRow>
            </FieldGroup>

            <FieldGroup>
                <Text variant="small">Link type</Text>
                <Select
                    value={selectedKey}
                    autoComplete="off"
                    onChange={e => onSelectScreen(e.currentTarget.value)}>
                    <optgroup label="Onboarding & Actions">
                        {onboardingConfigs.map(config => (
                            <option key={config.key} value={config.key}>
                                {config.label}
                            </option>
                        ))}
                    </optgroup>
                    <optgroup label="Navigation">
                        {navConfigs.map(config => (
                            <option key={config.key} value={config.key}>
                                {config.label}
                            </option>
                        ))}
                    </optgroup>
                </Select>
            </FieldGroup>

            <Description>
                <Text variant="caption">{selectedConfig.description}</Text>
            </Description>

            {selectedConfig.params.map(param => {
                const value = paramValues[param.name] || ''
                const error = value.trim()
                    ? validationErrors[param.name]
                    : undefined

                return (
                    <FieldGroup key={param.name}>
                        <Input
                            label={`${param.label}${param.required ? '' : ' (optional)'}`}
                            value={value}
                            placeholder={param.hint || param.label}
                            onChange={e =>
                                onChangeParam(param.name, e.currentTarget.value)
                            }
                        />
                        {error && (
                            <ErrorText variant="small">{error}</ErrorText>
                        )}
                    </FieldGroup>
                )
            })}
        </Form>
    )
}

const Form = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
})

const FieldGroup = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
})

const Select = styled('select', {
    height: 48,
    padding: '0 12px',
    border: `2px solid ${theme.colors.lightGrey}`,
    borderRadius: 8,
    background: theme.colors.white,
    fontSize: theme.fontSizes.body,
    cursor: 'pointer',

    '&:focus': {
        outline: 'none',
        borderColor: theme.colors.night,
    },
})

const Description = styled('div', {
    padding: '8px 12px',
    background: theme.colors.extraLightGrey,
    borderRadius: 8,
    lineHeight: 1.5,
})

const ToggleRow = styled('div', {
    display: 'flex',
    gap: 0,
    borderRadius: 8,
    overflow: 'hidden',
    border: `2px solid ${theme.colors.lightGrey}`,
})

const ToggleButton = styled('button', {
    flex: 1,
    padding: '10px 16px',
    fontSize: theme.fontSizes.caption,
    fontWeight: theme.fontWeights.medium,
    border: 'none',
    cursor: 'pointer',
    transition: 'background 80ms ease, color 80ms ease',

    variants: {
        active: {
            true: {
                background: theme.colors.night,
                color: theme.colors.white,
            },
            false: {
                background: theme.colors.white,
                color: theme.colors.night,
            },
        },
    },
    defaultVariants: {
        active: false,
    },
})

const ErrorText = styled(Text, {
    color: theme.colors.red,
    paddingLeft: 8,
})
