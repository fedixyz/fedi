import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { leaveFederation, selectActiveFederation } from '@fedi/common/redux'
import { getFederationTosUrl } from '@fedi/common/utils/FederationUtils'

import { useAppDispatch, useAppSelector } from '../hooks'
import { fedimint } from '../lib/bridge'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { ContentBlock } from './ContentBlock'
import FederationEndedPreview from './FederationEndedPreview'
import * as Layout from './Layout'

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
                    <FederationEndedPreview
                        popupInfo={popupInfo}
                        federation={activeFederation}
                    />
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
