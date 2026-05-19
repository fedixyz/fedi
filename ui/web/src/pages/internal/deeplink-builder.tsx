import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { stripFediPrefix } from '@fedi/common/utils/linking'

import { ContentBlock } from '../../components/ContentBlock'
import { DeepLinkForm } from '../../components/DeepLinkBuilder/DeepLinkForm'
import { DeepLinkResult } from '../../components/DeepLinkBuilder/DeepLinkResult'
import { DEEP_LINKS } from '../../components/DeepLinkBuilder/config'
import { AppContainer, AppContent } from '../../components/Template'
import { Text } from '../../components/Text'
import { styled } from '../../styles'

const DeepLinkBuilder: NextPage = () => {
    const router = useRouter()
    const [selectedKey, setSelectedKey] = useState(DEEP_LINKS[0].key)
    const [paramValues, setParamValues] = useState<Record<string, string>>({})
    const [environment, setEnvironment] = useState<'production' | 'staging'>(
        'production',
    )

    // Sync selectedKey from URL on mount and back-navigation
    useEffect(() => {
        const type = router.query.type as string | undefined
        if (type && DEEP_LINKS.some(c => c.key === type)) {
            setSelectedKey(type)
        }
    }, [router.query.type])

    const selectedConfig = useMemo(
        () => DEEP_LINKS.find(c => c.key === selectedKey) ?? DEEP_LINKS[0],
        [selectedKey],
    )

    const handleSelectScreen = useCallback(
        (key: string) => {
            setSelectedKey(key)
            setParamValues({})
            router.replace({ query: { type: key } }, undefined, {
                shallow: true,
            })
        },
        [router],
    )

    const generatedUrl = useMemo(() => {
        const base =
            environment === 'production'
                ? 'https://app.fedi.xyz/link'
                : 'https://fedi-ashen.vercel.app/link'

        const params = new URLSearchParams()
        params.set('screen', selectedConfig.screen)

        for (const param of selectedConfig.params) {
            let value = paramValues[param.name]?.trim()
            if (!value) continue
            if (param.stripFediPrefix) value = stripFediPrefix(value)
            if (param.normalize) value = param.normalize(value)
            params.set(param.name, value)
        }

        return `${base}#${params.toString()}`
    }, [environment, selectedConfig, paramValues])

    const validationErrors = useMemo(() => {
        const errors: Record<string, string> = {}
        for (const param of selectedConfig.params) {
            const value = paramValues[param.name]?.trim()
            if (!value || !param.validate) continue
            const error = param.validate(value)
            if (error) errors[param.name] = error
        }
        return errors
    }, [selectedConfig, paramValues])

    const hasRequiredFields = selectedConfig.params
        .filter(p => p.required)
        .every(p => paramValues[p.name]?.trim())

    const isValid =
        hasRequiredFields && Object.keys(validationErrors).length === 0

    return (
        <AppContainer>
            <AppContent>
                <ContentBlock css={{ overflow: 'auto' }}>
                    <Container>
                        <Text variant="h2">Deep Link Builder</Text>
                        <Text variant="caption" css={{ color: '$darkGrey' }}>
                            Generate deep links for Fedi with QR codes for easy
                            sharing and testing.
                        </Text>
                        <DeepLinkForm
                            configs={DEEP_LINKS}
                            selectedKey={selectedKey}
                            paramValues={paramValues}
                            environment={environment}
                            validationErrors={validationErrors}
                            onSelectScreen={handleSelectScreen}
                            onChangeParam={(name: string, value: string) =>
                                setParamValues(prev => ({
                                    ...prev,
                                    [name]: value,
                                }))
                            }
                            onChangeEnvironment={setEnvironment}
                        />
                        {isValid && <DeepLinkResult url={generatedUrl} />}
                    </Container>
                </ContentBlock>
            </AppContent>
        </AppContainer>
    )
}

// Skip AppProviders so the builder is reachable without completing onboarding
DeepLinkBuilder.noProviders = true

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    maxWidth: 480,
    width: '100%',
    padding: '32px 24px',
})

export default DeepLinkBuilder
