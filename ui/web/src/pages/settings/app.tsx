import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import SettingsIcon from '@fedi/common/assets/svgs/settings.svg'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectAnalyticsConsent,
    submitAnalyticsConsent,
} from '@fedi/common/redux/analytics'

import { ContentBlock } from '../../components/ContentBlock'
import { Icon } from '../../components/Icon'
import * as Layout from '../../components/Layout'
import { Switch } from '../../components/Switch'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'

const AppSettingsPage: React.FC = () => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const toast = useToast()

    const consent = useAppSelector(selectAnalyticsConsent) ?? false
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleConsentChange = useCallback(async () => {
        if (isSubmitting) return
        setIsSubmitting(true)

        try {
            await dispatch(
                submitAnalyticsConsent({
                    consent: !consent,
                    voteMethod: 'settings-update',
                }),
            ).unwrap()
        } catch (err) {
            toast.error(t, err, 'feature.settings.analytics-updated-error')
        } finally {
            setIsSubmitting(false)
        }
    }, [consent, dispatch, isSubmitting, t, toast])

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back="/settings">
                    <Layout.Title subheader>
                        {t('feature.settings.app-settings')}
                    </Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <Content>
                        <Row>
                            <TitleWrapper>
                                <Icon icon={SettingsIcon} size="sm" />
                                <Label htmlFor="analytics-consent-switch">
                                    {t('feature.settings.usage-sharing')}
                                </Label>
                            </TitleWrapper>
                            <Switch
                                id="analytics-consent-switch"
                                aria-label={t('feature.settings.usage-sharing')}
                                checked={!!consent}
                                disabled={isSubmitting}
                                onCheckedChange={handleConsentChange}
                            />
                        </Row>
                    </Content>
                </Layout.Content>
            </Layout.Root>
        </ContentBlock>
    )
}

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 16,
    gap: 16,
})

const Row = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '10px 0',
})

const Label = styled('label', {
    color: theme.colors.black,
    fontSize: '16px',
    fontWeight: 'bold',
})
const TitleWrapper = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
})

export default AppSettingsPage
