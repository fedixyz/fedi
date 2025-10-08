import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import bulbIcon from '@fedi/common/assets/svgs/bulb.svg'
import closeIcon from '@fedi/common/assets/svgs/close.svg'
import { theme } from '@fedi/common/constants/theme'
import {
    shouldShowAnalyticsConsentModal,
    submitAnalyticsConsent,
} from '@fedi/common/redux/analytics'
import { AnalyticsVoteMethod } from '@fedi/common/types/analytics'

import { useAppDispatch, useAppSelector } from '../hooks'
import { styled } from '../styles'
import { Button } from './Button'
import { Icon } from './Icon'
import { Modal } from './Modal'

const AnalyticsConsentModal: React.FC = () => {
    const show = useAppSelector(shouldShowAnalyticsConsentModal)
    const dispatch = useAppDispatch()

    const { t } = useTranslation()

    const hasSubmittedRef = useRef(false)

    useEffect(() => {
        if (show) {
            hasSubmittedRef.current = false
        }
    }, [show])

    const handleConsent = useCallback(
        (consent: boolean, voteMethod: AnalyticsVoteMethod) => {
            hasSubmittedRef.current = true
            dispatch(submitAnalyticsConsent({ consent, voteMethod }))
        },
        [dispatch],
    )

    const handleOverlayDismiss = useCallback(
        (open: boolean) => {
            if (!open && !hasSubmittedRef.current) {
                hasSubmittedRef.current = true
                dispatch(
                    submitAnalyticsConsent({
                        consent: false,
                        voteMethod: 'modal-dismiss',
                    }),
                )
            }
        },
        [dispatch],
    )

    const handleClickClose = useCallback(() => {
        handleOverlayDismiss(false)
    }, [handleOverlayDismiss])

    return (
        <Modal
            open={show}
            onOpenChange={handleOverlayDismiss}
            title={t('feature.support.analytics-consent-title')}
            showActions={false}
            description={t('feature.support.analytics-consent-description')}>
            <ModalContents>
                <Close onClick={handleClickClose}>
                    <Icon icon={closeIcon} size={20} />
                </Close>
                <IconWrapper>
                    <Icon icon={bulbIcon} size="md" />
                </IconWrapper>
                <h2>{t('feature.support.analytics-consent-title')}</h2>
                <Description>
                    {t('feature.support.analytics-consent-description')}
                </Description>
                <Actions>
                    <Button
                        width="full"
                        variant="primary"
                        onClick={() => handleConsent(true, 'modal-accept')}>
                        {t('words.sure')}
                    </Button>
                    <Button
                        width="full"
                        variant="tertiary"
                        onClick={() => handleConsent(false, 'modal-reject')}>
                        {t('phrases.not-now')}
                    </Button>
                </Actions>
            </ModalContents>
        </Modal>
    )
}

const Close = styled('button', {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 20,
    height: 20,
})

const ModalContents = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    position: 'relative',
})

const Description = styled('p', {
    textAlign: 'center',
    color: theme.colors.darkGrey,
})

const IconWrapper = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    width: 48,
    height: 48,
    holoGradient: '600',
})

const Actions = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: '100%',
    maxWidth: 400,
    '@sm': {
        maxWidth: '100%',
    },
})

export default AnalyticsConsentModal
