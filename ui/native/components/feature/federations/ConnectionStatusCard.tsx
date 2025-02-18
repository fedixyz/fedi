import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

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

    return (
        <View style={style.card}>
            <ConnectionTag status={status} size="large" hideArrow={hideArrow} />
            <Text
                caption
                medium
                style={style.caption}
                maxFontSizeMultiplier={1.2}>
                {caption}
            </Text>
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
    })

export default ConnectionStatusCard
