import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Column } from '../components/ui/Flex'
import GradientView from '../components/ui/GradientView'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { navigateToHome } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'RecoveryAssistConfirmation'
>

const RecoveryAssistConfirmation: React.FC<Props> = ({ navigation, route }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { type } = route.params

    const isError = type === 'error'

    const style = styles(theme)
    return (
        <GradientView variant="sky-banner" style={style.container}>
            <SafeAreaContainer edges={'all'}>
                <Column align="center" justify="center" gap="lg" grow>
                    <View style={style.content}>
                        <View
                            style={[
                                style.iconWrapper,
                                {
                                    backgroundColor: isError
                                        ? theme.colors.red100
                                        : theme.colors.green,
                                },
                            ]}>
                            <SvgImage
                                name={isError ? 'Close' : 'Check'}
                                size={theme.sizes.lg}
                                color={
                                    isError
                                        ? theme.colors.red
                                        : theme.colors.white
                                }
                            />
                        </View>
                        <Text h2 bold center>
                            {isError
                                ? t('words.rejected')
                                : t('words.confirmed')}
                        </Text>
                        <Text center style={{ color: theme.colors.darkGrey }}>
                            {isError
                                ? t(
                                      'feature.recovery.recovery-assist-confirmation-error',
                                  )
                                : t(
                                      'feature.recovery.recovery-assist-confirmation-success',
                                  )}
                        </Text>
                    </View>
                    <Button
                        fullWidth
                        onPress={() => navigation.dispatch(navigateToHome())}
                        title={t('words.done')}
                    />
                </Column>
            </SafeAreaContainer>
        </GradientView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        content: {
            alignItems: 'center',
            flex: 1,
            gap: theme.spacing.lg,
            justifyContent: 'center',
        },
        iconWrapper: {
            height: 100,
            width: 100,
            borderRadius: 50,
            alignItems: 'center',
            justifyContent: 'center',
        },
    })

export default RecoveryAssistConfirmation
