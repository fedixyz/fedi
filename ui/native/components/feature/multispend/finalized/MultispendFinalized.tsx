import { useNavigation } from '@react-navigation/native'
import { Button, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { selectMultispendBalanceCents } from '@fedi/common/redux'

import { useAppSelector } from '../../../../state/hooks'
import { Column } from '../../../ui/Flex'
import { SafeAreaContainer } from '../../../ui/SafeArea'
import RequestList from './RequestList'

const MultispendFinalized: React.FC<{
    roomId: string
}> = ({ roomId }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation()
    const multispendBalanceCents = useAppSelector(s =>
        selectMultispendBalanceCents(s, roomId),
    )

    const style = styles(theme)

    return (
        <Column grow gap="md">
            <RequestList roomId={roomId} />
            <SafeAreaContainer edges="notop" style={style.buttons}>
                <Button
                    containerStyle={style.button}
                    outline
                    onPress={() =>
                        navigation.navigate('MultispendDeposit', { roomId })
                    }
                    title={t('words.deposit')}
                    titleProps={{ numberOfLines: 1 }}
                />
                <Button
                    containerStyle={style.button}
                    disabled={multispendBalanceCents === 0}
                    onPress={() =>
                        navigation.navigate('MultispendWithdraw', { roomId })
                    }
                    title={t('words.withdraw')}
                    titleProps={{ numberOfLines: 1 }}
                />
            </SafeAreaContainer>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
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
