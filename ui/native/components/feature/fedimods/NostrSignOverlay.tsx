import { Text, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { RejectionError } from 'webln'

import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'
import { getNostrEventDisplay } from '@fedi/common/utils/nostr'
import {
    SignedNostrEvent,
    UnsignedNostrEvent,
} from '@fedi/injections/src/injectables/nostr/types'
import { eventHashFromEvent } from '@fedi/injections/src/injectables/nostr/utils'

import { fedimint } from '../../../bridge'
import { FediMod } from '../../../types'
import CustomOverlay from '../../ui/CustomOverlay'

const log = makeLog('AuthOverlay')

interface Props {
    fediMod: FediMod
    nostrEvent?: UnsignedNostrEvent | null
    onReject: (err: Error) => void
    onAccept: (signedEvent: SignedNostrEvent) => void
}

export const NostrSignOverlay: React.FC<Props> = ({
    fediMod,
    nostrEvent,
    onReject,
    onAccept,
}) => {
    const { t } = useTranslation()
    const toast = useToast()
    const { theme } = useTheme()
    const [isLoading, setIsLoading] = useState(false)

    const handleAccept = async () => {
        log.info('Signature approved')
        setIsLoading(true)
        try {
            if (!nostrEvent) throw new Error()
            const pubkey = await fedimint.getNostrPubKey()
            const id = eventHashFromEvent(pubkey, nostrEvent)
            const result = await fedimint.signNostrEvent(id)
            onAccept({
                id,
                pubkey,
                created_at: nostrEvent.created_at,
                kind: nostrEvent.kind,
                content: nostrEvent.content,
                tags: nostrEvent.tags,
                sig: result,
            })
        } catch (e) {
            log.error('Failed to sign Nostr event', e)
            toast.show({
                content: t('feature.fedimods.login-failed'),
                status: 'error',
            })
        }
        setIsLoading(false)
    }

    const handleReject = () => {
        onReject(new RejectionError('words.rejected'))
    }

    const display = nostrEvent ? getNostrEventDisplay(nostrEvent, t) : undefined

    // 22242 specifies that the nostr event is an authentication challenge
    const isAuthEvent = nostrEvent?.kind === 22242

    return (
        <CustomOverlay
            show={Boolean(nostrEvent)}
            loading={isLoading}
            onBackdropPress={() =>
                onReject(new RejectionError(t('errors.webln-canceled')))
            }
            contents={{
                icon: isAuthEvent ? 'LockSquareRounded' : undefined,
                title: isAuthEvent
                    ? undefined
                    : t('feature.nostr.wants-you-to-sign', {
                          fediMod: fediMod.title,
                      }),
                message: display?.kind && !isAuthEvent ? display.kind : '',
                body: isAuthEvent ? (
                    <Text>
                        <Trans
                            t={t}
                            i18nKey="feature.nostr.log-in-to-mod"
                            values={{
                                fediMod: fediMod.title,
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
                ) : undefined,
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
