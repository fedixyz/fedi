import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    selectActiveFederation,
    selectActiveFederationHasWallet,
    selectReceivesDisabled,
    setPayFromFederationId,
} from '@fedi/common/redux/federation'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import SvgImage from '../../ui/SvgImage'

type Props = {
    offline: boolean
}

const WalletButtons: React.FC<Props> = ({ offline }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const activeFederation = useAppSelector(selectActiveFederation)
    const hasWallet = useAppSelector(selectActiveFederationHasWallet)
    const receivesDisabled = useAppSelector(selectReceivesDisabled)

    const style = styles(theme)

    if (!activeFederation || !hasWallet) return null

    // I'm not happy about this, but I couldn't
    // figure out how to detect clicks when the
    // button is disabled
    return (
        <View style={style.container}>
            {receivesDisabled ? (
                <Pressable
                    style={style.buttonContainer}
                    onPress={() => {
                        toast.show({
                            content: t('errors.receives-have-been-disabled'),
                            status: 'error',
                        })
                    }}>
                    <Button
                        bubble
                        icon={<SvgImage name="ArrowDown" />}
                        titleStyle={style.buttonTitle}
                        title={
                            <Text caption numberOfLines={1}>
                                {t('words.receive')}
                            </Text>
                        }
                        disabled
                        style={style.disabled}
                        containerStyle={style.buttonContainer}
                        buttonStyle={style.button}
                    />
                </Pressable>
            ) : (
                <Button
                    bubble
                    icon={<SvgImage name="ArrowDown" />}
                    titleStyle={style.buttonTitle}
                    title={
                        <Text bold caption numberOfLines={1}>
                            {t('words.receive')}
                        </Text>
                    }
                    style={style.disabled}
                    containerStyle={style.buttonContainer}
                    buttonStyle={style.button}
                    onPress={() => navigation.navigate('ReceiveLightning')}
                />
            )}

            <Button
                bubble
                title={
                    <View style={style.buttonRow}>
                        <SvgImage name="ArrowUpRight" />
                        <Text bold caption numberOfLines={1}>
                            {t('words.send')}
                        </Text>
                    </View>
                }
                onPress={() => {
                    dispatch(setPayFromFederationId(activeFederation.id))
                    navigation.navigate(offline ? 'SendOfflineAmount' : 'Send')
                }}
                containerStyle={style.buttonContainer}
                // Sats are rounded down from msats. Disable the send button if the user has less than 1000 msat
                disabled={
                    !activeFederation.hasWallet ||
                    activeFederation.balance < 1000
                }
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            gap: theme.spacing.lg,
        },
        buttonContainer: {
            flex: 1,
        },
        buttonTitle: {
            color: theme.colors.primary,
            letterSpacing: -0.14,
            paddingLeft: theme.spacing.xl,
            gap: theme.spacing.xl,
        },
        buttonRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm,
        },
        button: {
            gap: theme.spacing.sm,
        },
        disabled: {},
    })

export default WalletButtons
