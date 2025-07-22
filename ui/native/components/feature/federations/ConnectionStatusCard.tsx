import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { selectIsInternetUnreachable } from '@fedi/common/redux'
import { FederationStatus } from '@fedi/common/types'

import { useAppSelector } from '../../../state/hooks'
import Flex from '../../ui/Flex'
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
    const isOffline = useAppSelector(selectIsInternetUnreachable)

    return (
        <Flex center gap="md" style={style.card}>
            {isOffline && (
                <Text caption medium style={style.caption}>
                    {t('feature.federations.last-known-status')}
                </Text>
            )}
            <ConnectionTag status={status} size="large" hideArrow={hideArrow} />
            {isOffline ? (
                <Text
                    caption
                    medium
                    style={style.lastKnownStatus}
                    maxFontSizeMultiplier={1.2}>
                    {t('feature.federations.please-reconnect')}
                </Text>
            ) : (
                <Text
                    caption
                    medium
                    style={style.caption}
                    maxFontSizeMultiplier={1.2}>
                    {caption}
                </Text>
            )}
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            padding: theme.spacing.lg,
            backgroundColor: theme.colors.offWhite100,
            borderRadius: 20,
            alignSelf: 'stretch',
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
