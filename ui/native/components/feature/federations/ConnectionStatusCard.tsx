import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useIsInternetUnreachable } from '@fedi/common/hooks/environment'
import { FederationStatus } from '@fedi/common/types'

import { ConnectionTag } from './ConnectionTag'

type Props = {
    status: FederationStatus
    hideArrow?: boolean
}

const ConnectionStatusCard = ({ status, hideArrow = false }: Props) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const { t } = useTranslation()
    const caption = t(`feature.federations.connection-status-${status}`)
    const isInternetUnreachable = useIsInternetUnreachable()

    return (
        <View style={style.card}>
            {isInternetUnreachable && (
                <Text caption medium style={style.caption}>
                    {t('feature.federations.last-known-status')}
                </Text>
            )}
            <ConnectionTag status={status} size="large" hideArrow={hideArrow} />
            {!isInternetUnreachable && (
                <Text
                    caption
                    medium
                    style={style.caption}
                    maxFontSizeMultiplier={1.2}>
                    {caption}
                </Text>
            )}
            {isInternetUnreachable && (
                <Text
                    caption
                    medium
                    style={style.lastKnownStatus}
                    maxFontSizeMultiplier={1.2}>
                    {t('feature.federations.please-reconnect')}
                </Text>
            )}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            padding: theme.spacing.lg,
            backgroundColor: theme.colors.offWhite100,
            justifyContent: 'center',
            gap: theme.spacing.md,
            borderRadius: 20,
            display: 'flex',
            alignItems: 'center',
            alignSelf: 'stretch',
        },
        content: {
            display: 'flex',
            gap: theme.spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'center',
        },
        caption: {
            textAlign: 'center',
            color: theme.colors.darkGrey,
        },
        lastKnownStatus: {
            textAlign: 'center',
            color: theme.colors.darkGrey,
            maxWidth: 240,
        },
    })

export default ConnectionStatusCard
