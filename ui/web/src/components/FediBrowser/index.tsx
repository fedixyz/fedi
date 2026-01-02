import React, { useEffect, useRef, useState } from 'react'

import CloseIcon from '@fedi/common/assets/svgs/close.svg'
import RefreshIcon from '@fedi/common/assets/svgs/retry.svg'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { setSiteInfo } from '@fedi/common/redux'
import { InjectionMessageType } from '@fedi/injections/src/types'

import { useAppDispatch, useIFrameListener } from '../../hooks'
import { styled, theme } from '../../styles'
import { Icon } from '../Icon'
import { Text } from '../Text'
import { FediBrowserDialog } from './FediBrowserDialog'
import { SelectPublicChats as SelectPublicChatsOverlay } from './overlays/SelectPublicChats'
import { SendPayment as SendPaymentOverlay } from './overlays/SendPayment'

type Props = {
    url: string
    onClose(): void
}

export const FediBrowser: React.FC<Props> = ({ url, onClose }) => {
    const fedimint = useFedimint()
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const { overlayId, resetOverlay, sendSuccess, sendError } =
        useIFrameListener(iframeRef)
    const dispatch = useAppDispatch()
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

    const handleClose = () => {
        fedimint.onAppForeground()
        onClose()
    }

    return (
        <FediBrowserDialog open={!!url} onOpenChange={handleClose}>
            <SendPaymentOverlay
                open={overlayId === 'webln_sendPayment'}
                onAccept={res => {
                    sendSuccess(InjectionMessageType.webln_sendPayment, res)
                    resetOverlay()
                }}
                onReject={() => {
                    sendError(
                        InjectionMessageType.webln_sendPayment,
                        'SendPayment error',
                    )
                    resetOverlay()
                }}
            />
            <SelectPublicChatsOverlay
                open={overlayId === 'fedi_selectPublicChats'}
                onConfirm={res => {
                    sendSuccess(
                        InjectionMessageType.fedi_selectPublicChats,
                        res,
                    )
                    resetOverlay()
                }}
            />
            <Wrapper>
                <IFrame
                    aria-label="browser iframe"
                    key={url}
                    ref={iframeRef}
                    src={url}
                    allow="clipboard-write; clipboard-read" // todo - research permission policies when used for other mini-apps
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
                            onClick={handleClose}>
                            <Icon icon={CloseIcon} />
                        </CloseWrapper>
                    </NavRight>
                </Nav>
            </Wrapper>
        </FediBrowserDialog>
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
    cursor: 'pointer',
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
