import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Insets, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const GuardianitoHelp: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const style = styles(theme, insets)

    return (
        <View style={style.guardianitoHelpTextContainer}>
            <Text small style={style.guardianitoHelpText}>
                {t('feature.chat.guardianito-help-text')}
            </Text>
        </View>
    )
}

const styles = (theme: Theme, insets: Insets) =>
    StyleSheet.create({
        guardianitoHelpTextContainer: {
            // TODO: clean up his hacky styling
            position: 'relative',
            marginLeft: -(theme.spacing.md + (insets.left || 0)),
            marginRight: -(theme.spacing.md + (insets.right || 0)),
            marginTop: -theme.spacing.sm,
            paddingTop: theme.spacing.xs,
            paddingBottom: theme.spacing.xs,
            paddingHorizontal: theme.spacing.md + (insets.left || 0),
            backgroundColor: theme.colors.offWhite100,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.primaryVeryLight,
        },
        guardianitoHelpText: {
            color: theme.colors.grey,
            textAlign: 'left',
        },
    })

export default GuardianitoHelp
