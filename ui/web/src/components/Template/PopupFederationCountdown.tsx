import React, { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { selectActiveFederation } from '@fedi/common/redux'

import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import { FederationAvatar } from '../FederationAvatar'
import { Text } from '../Text'

export const PopupFederationCountdown: React.FC = () => {
    const { t } = useTranslation()
    const activeFederation = useAppSelector(selectActiveFederation)
    const popupInfo = usePopupFederationInfo()
    const [isOpen, setIsOpen] = useState(false)

    // When the federation ends soon, force the dialog to open once per session.
    useEffect(() => {
        if (!popupInfo?.endsSoon) return
        if (sessionStorage.getItem('has-seen-popup-dialog')) return
        setTimeout(() => {
            setIsOpen(true)
            sessionStorage.setItem('has-seen-popup-dialog', 'true')
        }, 1000)
    }, [popupInfo?.endsSoon])

    if (!popupInfo || !activeFederation) {
        return null
    }

    const countdownPillProps = {
        ended: popupInfo.ended,
        endsSoon: popupInfo.endsSoon,
    }
    const countdownI18nText =
        popupInfo.secondsLeft <= 0 ? (
            <strong>{t('feature.popup.ended')}</strong>
        ) : (
            <Trans
                t={t}
                i18nKey="feature.popup.ending-in"
                values={{ time: popupInfo.endsInText }}
                components={{ bold: <strong /> }}
            />
        )

    return (
        <>
            <CountdownPill
                {...countdownPillProps}
                as={popupInfo.ended ? 'div' : 'button'}
                onClick={popupInfo.ended ? undefined : () => setIsOpen(true)}>
                {countdownI18nText}
            </CountdownPill>
            <Dialog size="md" open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent>
                    <FederationAvatar federation={activeFederation} size="lg" />
                    <Text variant="h2">{activeFederation.name}</Text>
                    <CountdownPill {...countdownPillProps}>
                        {countdownI18nText}
                    </CountdownPill>
                    <Text>
                        {popupInfo.countdownMessage || (
                            <Trans
                                t={t}
                                i18nKey="feature.popup.ending-description"
                                values={{ date: popupInfo.endsAtText }}
                                components={{ bold: <strong /> }}
                            />
                        )}
                    </Text>
                    <Button
                        width="full"
                        variant="secondary"
                        onClick={() => setIsOpen(false)}>
                        {t('phrases.i-understand')}
                    </Button>
                </DialogContent>
            </Dialog>
        </>
    )
}

const CountdownPill = styled('div', {
    padding: `2px 8px`,
    borderRadius: '30px',
    background: '#BAE0FE',
    fontSize: theme.fontSizes.caption,
    color: theme.colors.primary,

    '&button': {
        cursor: 'pointer',
    },

    '@xs': {
        fontSize: 0,
        '& > strong': {
            fontSize: theme.fontSizes.caption,
        },
    },

    variants: {
        endsSoon: {
            true: {
                background: theme.colors.red,
                color: theme.colors.white,
            },
        },
        ended: {
            true: {
                background: theme.colors.lightGrey,
                color: theme.colors.primary,
            },
        },
    },
})

const DialogContent = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    width: '100%',
    maxWidth: '360px',
    margin: 'auto',
    gap: 16,
})
