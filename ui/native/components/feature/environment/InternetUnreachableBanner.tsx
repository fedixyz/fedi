import { Text, Theme, useTheme, Button } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useRecheckInternet } from '../../../utils/hooks/environment'
import SvgImage from '../../ui/SvgImage'

const InternetUnreachableBanner: React.FC = () => {
    const { theme } = useTheme()
    const style = styles(theme)
    const { t } = useTranslation()

    const recheckConnection = useRecheckInternet()

    return (
        <View style={style.container}>
            <View style={style.infoContainer}>
                <SvgImage name="WifiOff" size={24} color={theme.colors.red} />
                <Text caption style={style.infoText}>
                    {t('errors.actions-require-internet')}
                </Text>
            </View>
            <Button
                title={
                    <Text medium caption style={style.retryText}>
                        {t('words.retry')}
                    </Text>
                }
                onPress={recheckConnection}
                size="sm"
                icon={
                    <SvgImage
                        name="Retry"
                        size={16}
                        color={theme.colors.white}
                    />
                }
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            backgroundColor: theme.colors.red100,
            padding: theme.spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xl,
        },
        infoContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            flexGrow: 1,
            flexShrink: 1,
        },
        infoText: {
            color: theme.colors.red,
        },
        retryText: {
            color: theme.colors.white,
            marginLeft: theme.spacing.xs,
        },
    })

export default InternetUnreachableBanner
