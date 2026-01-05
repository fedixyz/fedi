import { Text, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { RejectionError } from 'webln'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { selectNostrUnsignedEvent, selectSiteInfo } from '@fedi/common/redux'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { makeLog } from '@fedi/common/utils/log'
import { getNostrEventDisplay } from '@fedi/common/utils/nostr'
import { SignedNostrEvent } from '@fedi/injections/src/injectables/nostr/types'
import { eventHashFromEvent } from '@fedi/injections/src/injectables/nostr/utils'

import { useAppSelector } from '../../../state/hooks'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column } from '../../ui/Flex'

const log = makeLog('AuthOverlay')

interface Props {
    onReject: (err: Error) => void
    onAccept: (signedEvent: SignedNostrEvent) => void
}

export const NostrSignOverlay: React.FC<Props> = ({ onReject, onAccept }) => {
    const { t } = useTranslation()
    const unsignedNostrEvent = useAppSelector(selectNostrUnsignedEvent)
    const siteInfo = useAppSelector(selectSiteInfo)
    const fedimint = useFedimint()
    const { theme } = useTheme()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleAccept = async () => {
        log.info('Signature approved')
        setIsLoading(true)
        try {
            if (!unsignedNostrEvent) throw new Error()
            const { hex } = await fedimint.getNostrPubkey()
            const id = eventHashFromEvent(hex, unsignedNostrEvent)
            const result = await fedimint.signNostrEvent(id)
            onAccept({
                id,
                pubkey: hex,
                created_at: unsignedNostrEvent.created_at,
                kind: unsignedNostrEvent.kind,
                content: unsignedNostrEvent.content,
                tags: unsignedNostrEvent.tags,
                sig: result,
            })
        } catch (e) {
            log.error('Failed to sign Nostr event', e)

            setError(formatErrorMessage(t, e, 'errors.unknown-error'))
        }
        setIsLoading(false)
    }

    const handleReject = () => {
        onReject(new RejectionError('words.rejected'))
    }

    const display = unsignedNostrEvent
        ? getNostrEventDisplay(unsignedNostrEvent, t)
        : undefined

    // 22242 specifies that the nostr event is an authentication challenge
    const isAuthEvent = unsignedNostrEvent?.kind === 22242

    return (
        <CustomOverlay
            show={Boolean(unsignedNostrEvent)}
            loading={isLoading}
            onBackdropPress={() =>
                onReject(new RejectionError(t('errors.webln-canceled')))
            }
            contents={{
                icon: isAuthEvent ? 'LockSquareRounded' : undefined,
                title: isAuthEvent
                    ? undefined
                    : t('feature.nostr.wants-you-to-sign', {
                          fediMod: siteInfo?.title,
                      }),
                message: display?.kind && !isAuthEvent ? display.kind : '',
                body: (
                    <Column gap="lg">
                        {isAuthEvent ? (
                            <Text>
                                <Trans
                                    t={t}
                                    i18nKey="feature.nostr.log-in-to-mod"
                                    values={{
                                        fediMod: siteInfo?.title,
                                        method: t('words.nostr'),
                                    }}
                                    components={{ bold: <Text caption bold /> }}
                                />
                            </Text>
                        ) : display?.content ? (
                            <Text
                                caption
                                style={{
                                    paddingTop: theme.spacing.lg,
                                    paddingBottom: theme.spacing.sm,
                                    paddingHorizontal: theme.spacing.sm,
                                    color: theme.colors.grey,
                                    textAlign: 'center',
                                }}
                                numberOfLines={3}>
                                "{display.content}"
                            </Text>
                        ) : undefined}
                        {error && (
                            <Text
                                caption
                                color={theme.colors.red}
                                style={{ textAlign: 'center' }}>
                                {error}
                            </Text>
                        )}
                    </Column>
                ),
                buttons: [
                    {
                        text: t(isAuthEvent ? 'phrases.go-back' : 'words.no'),
                        onPress: handleReject,
                    },
                    {
                        primary: true,
                        text: t(isAuthEvent ? 'words.continue' : 'words.yes'),
                        onPress: handleAccept,
                    },
                ],
            }}
        />
    )
}
