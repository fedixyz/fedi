import { Divider, Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { selectIsInternetUnreachable } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { LoadedFederation } from '../../../types'
import { Column, Row } from '../../ui/Flex'
import SvgImage, { SvgImageName } from '../../ui/SvgImage'

const FederationStatus = ({ federation }: { federation: LoadedFederation }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)

    const status = federation.status || 'offline'
    const isOffline = useAppSelector(selectIsInternetUnreachable)

    const popupInfo = usePopupFederationInfo(federation?.meta ?? {})

    let statusMessage = t('feature.federations.connection-status-offline')
    let statusIcon: SvgImageName = 'AlertWarningTriangle'
    let statusWord = t('words.offline')
    let statusIconColor = theme.colors.red

    if (status === 'online') {
        statusIcon = 'Online'
        statusIconColor = theme.colors.success
        statusWord = t('words.online')
        statusMessage = t('feature.federations.connection-status-online')
    } else if (status === 'unstable') {
        statusIcon = 'Info'
        statusWord = t('words.unstable')
        statusMessage = t('feature.federations.connection-status-unstable')
    }

    if (popupInfo?.ended) {
        statusIcon = 'Online'
        statusIconColor = theme.colors.grey
        statusWord = t('words.expired')
        statusMessage = t('feature.federations.connection-status-expired')
    }

    return (
        <Column gap="sm" style={style.federationStatusCard}>
            <Row align="center" justify="between">
                <Column shrink>
                    <Text caption maxFontSizeMultiplier={1.2}>
                        {isOffline
                            ? t('feature.federations.last-known-status')
                            : t('words.status')}
                    </Text>
                </Column>
                <Row center shrink={false} gap="xs">
                    <SvgImage
                        size={16}
                        name={statusIcon}
                        color={statusIconColor}
                    />
                    <Text
                        medium
                        caption
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        maxFontSizeMultiplier={1.4}>
                        {statusWord}
                    </Text>
                </Row>
            </Row>
            <Divider />
            <Text caption>
                {isOffline
                    ? t('feature.federations.please-reconnect')
                    : statusMessage}
            </Text>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        federationStatusCard: {
            borderWidth: 1,
            borderColor: theme.colors.extraLightGrey,
            borderRadius: 20,
            padding: theme.spacing.lg,
        },
    })

export default FederationStatus
