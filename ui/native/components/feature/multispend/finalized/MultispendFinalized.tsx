import { useNavigation } from '@react-navigation/native'
import { Button, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { SafeAreaContainer } from '../../../ui/SafeArea'
import RequestList from './RequestList'

const MultispendFinalized: React.FC<{
    roomId: string
}> = ({ roomId }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation()

    const style = styles(theme)

    return (
        <View style={style.container}>
            <RequestList roomId={roomId} />
            <SafeAreaContainer edges="notop" style={style.buttons}>
                <Button
                    containerStyle={style.button}
                    outline
                    onPress={() =>
                        navigation.navigate('MultispendDeposit', { roomId })
                    }>
                    {t('words.deposit')}
                </Button>
                <Button
                    containerStyle={style.button}
                    onPress={() =>
                        navigation.navigate('MultispendWithdraw', { roomId })
                    }>
                    {t('words.withdraw')}
                </Button>
            </SafeAreaContainer>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            flexDirection: 'column',
            gap: theme.spacing.md,
        },
        buttons: {
            backgroundColor: theme.colors.white,
            flex: 0,
            flexDirection: 'row',
            gap: theme.spacing.md,
            paddingTop: theme.spacing.md,
            shadowColor: 'rgba(11, 16, 19, 0.1)',
            shadowOffset: {
                width: 0,
                height: 4,
            },
            shadowRadius: 12,
            elevation: 12,
            shadowOpacity: 1,
            borderTopWidth: 1,
            borderColor: theme.colors.extraLightGrey,
        },
        button: {
            flex: 1,
        },
    })

export default MultispendFinalized
