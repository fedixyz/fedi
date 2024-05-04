import { useNavigation } from '@react-navigation/native'
import type { Theme } from '@rneui/themed'
import { Button, Card, Text, TextProps, useTheme } from '@rneui/themed'
import capitalize from 'lodash/capitalize'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    selectActiveFederation,
    selectReceivesDisabled,
} from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { Network } from '../../../types'
import { NavigationHook } from '../../../types/navigation'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import Balance from './Balance'

type Props = {
    offline: boolean
}

const BitcoinWallet: React.FC<Props> = ({ offline }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const toast = useToast()
    const activeFederation = useAppSelector(selectActiveFederation)
    const receivesDisabled = useAppSelector(selectReceivesDisabled)

    const network = activeFederation?.network
    const buttonTitleProps: Partial<TextProps> = {
        caption: true,
        medium: true,
        style: styles(theme).buttonTitle,
        maxFontSizeMultiplier: 1.8,
        numberOfLines: 1,
    }

    if (!activeFederation) return null

    return (
        <Card
            containerStyle={styles(theme).container}
            wrapperStyle={styles(theme).cardWrapper}>
            <View style={styles(theme).titleContainer}>
                <SvgImage
                    name="BitcoinCircle"
                    size={SvgImageSize.md}
                    color={theme.colors.white}
                />
                <View style={styles(theme).titleTextContainer}>
                    <Text bold style={styles(theme).titleText}>
                        {t('words.bitcoin')}
                    </Text>
                    {network && network !== Network.bitcoin && (
                        <Text small medium style={styles(theme).titleText}>
                            {capitalize(network)}
                        </Text>
                    )}
                </View>
                <Pressable onPress={() => navigation.navigate('Transactions')}>
                    <SvgImage name="List" color={theme.colors.secondary} />
                </Pressable>
            </View>
            <Balance />
            <View style={styles(theme).buttonsGroupContainer}>
                {receivesDisabled ? (
                    <Pressable
                        style={styles(theme).buttonContainer}
                        onPress={() => {
                            toast.show({
                                content: t(
                                    'errors.receives-have-been-disabled',
                                ),
                                status: 'error',
                            })
                        }}>
                        <Button
                            title={
                                <Text {...buttonTitleProps}>
                                    {t('words.request')}
                                </Text>
                            }
                            disabled
                            buttonStyle={styles(theme).button}
                        />
                    </Pressable>
                ) : (
                    <Button
                        title={
                            <Text {...buttonTitleProps}>
                                {t('words.request')}
                            </Text>
                        }
                        onPress={() => navigation.navigate('ReceiveLightning')}
                        containerStyle={styles(theme).buttonContainer}
                        buttonStyle={styles(theme).button}
                    />
                )}

                <Button
                    title={<Text {...buttonTitleProps}>{t('words.send')}</Text>}
                    onPress={() =>
                        navigation.navigate(
                            offline ? 'SendOfflineAmount' : 'Send',
                        )
                    }
                    containerStyle={styles(theme).buttonContainer}
                    buttonStyle={styles(theme).button}
                    disabled={!(activeFederation.balance > 0)}
                />
            </View>
        </Card>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            backgroundColor: theme.colors.orange,
            borderRadius: theme.borders.defaultRadius,
            padding: theme.spacing.lg,
            width: '100%',
            height: theme.sizes.walletCardHeight,
            margin: 0,
            borderWidth: 0,
            shadowColor: 'transparent',
        },
        cardWrapper: {
            flex: 1,
            justifyContent: 'space-between',
            gap: theme.spacing.lg,
        },
        titleContainer: {
            textAlign: 'left',
            flexDirection: 'row',
            alignItems: 'center',
        },
        titleTextContainer: {
            flex: 1,
            paddingHorizontal: theme.spacing.sm,
        },
        titleText: {
            color: theme.colors.secondary,
        },
        iconsContainer: {
            flexDirection: 'row',
            alignItems: 'flex-end',
        },
        buttonsGroupContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: theme.spacing.lg,
        },
        button: {
            backgroundColor: theme.colors.secondary,
        },
        buttonContainer: {
            flex: 1,
        },
        buttonTitle: {
            color: theme.colors.primary,
        },
    })

export default BitcoinWallet
