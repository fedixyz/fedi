import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import CloseIcon from '@fedi/common/assets/svgs/close.svg'
import RefreshIcon from '@fedi/common/assets/svgs/retry.svg'
import { resetBrowserOverlayState, setSiteInfo } from '@fedi/common/redux'

import { useAppDispatch, useIFrameListener } from '../hooks'
import { styled, theme } from '../styles'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { SendPaymentOverlay } from './Overlays'
import { Text } from './Text'

type Props = {
    url: string
    onClose(): void
}

export const FediModBrowser: React.FC<Props> = ({ url, onClose }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const { sendSuccess, sendError } = useIFrameListener(iframeRef)
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const [domain, setDomain] = useState<string | null>(null)

    useEffect(() => {
        try {
            const { hostname } = new URL(url)
            setDomain(hostname.replace('www.', ''))
        } catch {
            setDomain(url)
        }
    }, [url])

    useEffect(() => {
        if (!domain) return
        try {
            dispatch(setSiteInfo({ title: domain, url }))
        } catch {
            // noop
        }
    }, [dispatch, domain, url])

    const handleOnRefresh = () => {
        if (iframeRef.current) {
            const newSrc = iframeRef.current.src
            iframeRef.current.src = newSrc
        }
    }

    return (
        <Dialog
            open={!!url}
            onOpenChange={onClose}
            disableOverlayHandle
            disableClose
            disablePadding>
            <SendPaymentOverlay
                onAccept={res => {
                    sendSuccess('webln.sendPayment', res)
                    dispatch(resetBrowserOverlayState())
                }}
                onReject={() => {
                    sendError(
                        'webln.sendPayment',
                        t('errors.failed-to-send-payment'),
                    )
                    dispatch(resetBrowserOverlayState())
                }}
            />
            <Wrapper>
                <IFrame
                    aria-label="browser iframe"
                    key={url}
                    ref={iframeRef}
                    src={url}
                />
                <Nav aria-label="browser navbar">
                    <NavLeft>
                        <RefreshWrapper
                            aria-label="Refresh"
                            onClick={handleOnRefresh}>
                            <Icon icon={RefreshIcon} />
                        </RefreshWrapper>
                    </NavLeft>
                    <NavCenter>
                        <AddressBar variant="body">{domain}</AddressBar>
                    </NavCenter>
                    <NavRight>
                        <CloseWrapper
                            aria-label="close button"
                            onClick={onClose}>
                            <Icon icon={CloseIcon} />
                        </CloseWrapper>
                    </NavRight>
                </Nav>
            </Wrapper>
        </Dialog>
    )
}

const Wrapper = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
})

const IFrame = styled('iframe', {
    border: 0,
    flex: 1,
    height: '100%',
    width: '100%',
})

const Nav = styled('div', {
    alignItems: 'center',
    background: theme.colors.white,
    borderTop: `1px solid ${theme.colors.extraLightGrey}`,
    top: 0,
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    width: '100%',

    '@standalone': {
        '@sm': {
            paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        },
    },
})

const NavLeft = styled('div', {
    alignItems: 'center',
    display: 'flex',
    height: '100%',
    width: 40,
})

const RefreshWrapper = styled('div', {
    alignItems: 'center',
    display: 'flex',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
})

const NavCenter = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
})

const NavRight = styled('div', {
    height: '100%',
    width: 40,
})

const AddressBar = styled(Text, {
    alignItems: 'center',
    background: theme.colors.extraLightGrey,
    borderRadius: 5,
    display: 'flex',
    height: 30,
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    width: '100%',
})

const CloseWrapper = styled('div', {
    alignItems: 'center',
    cursor: 'pointer',
    display: 'flex',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
})
