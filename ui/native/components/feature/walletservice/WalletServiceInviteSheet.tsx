import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import { SERVICE_CARD_BG } from '../../../constants/walletServiceTheme'
import { CopyButton } from '../../ui/CopyButton'
import { Eyebrow } from '../../ui/Eyebrow'
import { Column, Row } from '../../ui/Flex'
import QRCodeContainer from '../../ui/QRCodeContainer'
import { ServiceSheet } from './ServiceSheet'

/**
 * Shareable invite for a live wallet service.
 *
 * Matches the prototype's invite sheet: a QR over the raw link with a copy
 * action, dismissed by a single "Done".
 */
export const WalletServiceInviteSheet: React.FC<{
    show: boolean
    inviteCode: string
    /** Shown in the title so the operator sees which service they are sharing. */
    serviceName?: string | null
    onDismiss: () => void
}> = ({ show, inviteCode, serviceName, onDismiss }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    return (
        <ServiceSheet
            show={show}
            onDismiss={onDismiss}
            title={
                serviceName
                    ? t('feature.wallet-service.invite-to', {
                          name: serviceName,
                      })
                    : t('feature.wallet-service.invite-title')
            }
            description={t('feature.wallet-service.invite-subtitle')}
            buttons={[
                {
                    text: t('words.done'),
                    primary: true,
                    onPress: onDismiss,
                },
            ]}>
            {
                <Column gap="md" fullWidth>
                    <QRCodeContainer
                        qrValue={inviteCode}
                        copyMessage={t('phrases.copied-to-clipboard')}
                        copyValue={inviteCode}
                    />
                    <Column gap="xs" fullWidth>
                        <Eyebrow>
                            {t('feature.wallet-service.invite-link')}
                        </Eyebrow>
                        <Row align="center" gap="sm" style={style.linkRow}>
                            <Text
                                style={style.link}
                                numberOfLines={1}
                                ellipsizeMode="middle">
                                {inviteCode}
                            </Text>
                            <CopyButton value={inviteCode} />
                        </Row>
                    </Column>
                </Column>
            }
        </ServiceSheet>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        linkRow: {
            backgroundColor: SERVICE_CARD_BG,
            borderColor: theme.colors.dividerGrey,
            borderRadius: 12,
            borderWidth: 1,
            paddingHorizontal: 14,
            paddingVertical: 12,
        },
        link: {
            color: theme.colors.primary,
            flexShrink: 1,
            fontSize: fediTheme.fontSizes.caption,
        },
    })
