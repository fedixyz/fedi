import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { leaveFederation, selectActiveFederation } from '@fedi/common/redux'
import { getFederationTosUrl } from '@fedi/common/utils/FederationUtils'

import { useAppDispatch, useAppSelector } from '../hooks'
import { fedimint } from '../lib/bridge'
import { styled, theme } from '../styles'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { ContentBlock } from './ContentBlock'
import { FederationAvatar } from './FederationAvatar'
import * as Layout from './Layout'
import { Text } from './Text'

export const PopupFederationOver: React.FC = () => {
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const toast = useToast()
    const activeFederation = useAppSelector(selectActiveFederation)
    const popupInfo = usePopupFederationInfo()
    const [isLeavingFederation, setIsLeavingFederation] = useState(false)

    if (!activeFederation || !popupInfo) return null

    const handleLeaveFederation = () => {
        setIsLeavingFederation(true)
    }

    const handleConfirmLeaveFederation = async () => {
        if (!activeFederation) return
        try {
            await dispatch(
                leaveFederation({
                    fedimint,
                    federationId: activeFederation.id,
                }),
            )
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
            return
        }
        setIsLeavingFederation(false)
    }

    const tosUrl = getFederationTosUrl(activeFederation?.meta)

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Content centered>
                    <Container>
                        <FederationAvatar
                            federation={activeFederation}
                            size="lg"
                        />
                        <Text variant="h2">{activeFederation.name}</Text>
                        <Ended>{t('feature.popup.ended')}</Ended>
                        <Text css={{ marginBottom: 24 }}>
                            {popupInfo.endedMessage || (
                                <Trans
                                    t={t}
                                    i18nKey="feature.popup.ended-description"
                                    values={{ date: popupInfo.endsAtText }}
                                    components={{ bold: <strong /> }}
                                />
                            )}
                        </Text>
                    </Container>
                </Layout.Content>
                <Layout.Actions>
                    {tosUrl && (
                        <Button width="full" variant="secondary" href={tosUrl}>
                            {t('phrases.terms-and-conditions')}
                        </Button>
                    )}
                    <Button
                        variant="primary"
                        width="full"
                        onClick={handleLeaveFederation}
                        loading={isLeavingFederation}>
                        {t('feature.federations.leave-federation')}
                    </Button>
                </Layout.Actions>
            </Layout.Root>
            <ConfirmDialog
                open={isLeavingFederation}
                title={t('feature.federations.leave-federation')}
                description={t(
                    'feature.federations.leave-federation-confirmation',
                )}
                onClose={() => setIsLeavingFederation(false)}
                onConfirm={handleConfirmLeaveFederation}
            />
        </ContentBlock>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: 16,
})

const Ended = styled('div', {
    padding: `2px 8px`,
    borderRadius: '30px',
    background: theme.colors.lightGrey,
    color: theme.colors.primary,
    fontSize: theme.fontSizes.caption,
    fontWeight: theme.fontWeights.bold,
})
