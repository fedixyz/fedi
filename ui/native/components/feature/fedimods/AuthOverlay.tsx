import { Text, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { RejectionError } from 'webln'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { selectLnurlAuthRequest, selectSiteInfo } from '@fedi/common/redux'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { lnurlAuth } from '@fedi/common/utils/lnurl'
import { makeLog } from '@fedi/common/utils/log'

import { useAppSelector } from '../../../state/hooks'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column } from '../../ui/Flex'

const log = makeLog('AuthOverlay')

interface Props {
    onReject: (err: Error) => void
    onAccept: () => void
}

export const AuthOverlay: React.FC<Props> = ({ onReject, onAccept }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const fedimint = useFedimint()
    const lnurlAuthRequest = useAppSelector(selectLnurlAuthRequest)
    const siteInfo = useAppSelector(selectSiteInfo)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Overlay components for LNURL-Auth UX
    const handleAccept = () => {
        if (!lnurlAuthRequest) return

        setIsLoading(true)
        lnurlAuth(fedimint, lnurlAuthRequest)
            .match(onAccept, e => {
                log.error('Failed to LNURL auth', e)

                setError(formatErrorMessage(t, e, 'errors.unknown-error'))
            })
            .finally(() => setIsLoading(false))
    }

    const handleReject = () => {
        onReject(new RejectionError('words.rejected'))
    }

    return (
        <CustomOverlay
            show={Boolean(lnurlAuthRequest)}
            loading={isLoading}
            onBackdropPress={() =>
                onReject(new RejectionError(t('errors.webln-canceled')))
            }
            contents={{
                icon: 'LockSquareRounded',
                body: (
                    <Column gap="lg">
                        <Text>
                            <Trans
                                t={t}
                                i18nKey="feature.nostr.log-in-to-mod"
                                values={{
                                    fediMod: siteInfo?.title,
                                    method: t('words.lightning'),
                                }}
                                components={{ bold: <Text caption bold /> }}
                            />
                        </Text>
                        {error && (
                            <Text caption color={theme.colors.red}>
                                {error}
                            </Text>
                        )}
                    </Column>
                ),
                buttons: [
                    {
                        text: t('phrases.go-back'),
                        onPress: handleReject,
                    },
                    {
                        primary: true,
                        text: t('words.continue'),
                        onPress: handleAccept,
                    },
                ],
            }}
        />
    )
}
