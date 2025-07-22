import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    selectActiveFederation,
    selectActiveFederationHasWallet,
    selectReceivesDisabled,
    setPayFromFederationId,
} from '@fedi/common/redux/federation'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import Flex from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

type Override = {
    label?: string
    onPress?: () => void
    disabled?: boolean
}

export type WalletButtonsProps = {
    offline: boolean
    left?: Override
    right?: Override
}

const WalletButtons: React.FC<WalletButtonsProps> = ({
    offline,
    left = {},
    right = {},
}) => {
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

    const leftDisabled = left.disabled ?? receivesDisabled
    const rightDisabled =
        right.disabled ??
        (!activeFederation.hasWallet || activeFederation.balance < 1000)

    const handleLeft = () => {
        if (left.onPress) return left.onPress()
        if (receivesDisabled) {
            toast.show({
                content: t('errors.receives-have-been-disabled'),
                status: 'error',
            })
        } else {
            navigation.navigate('ReceiveLightning')
        }
    }

    const handleRight = () => {
        if (right.onPress) return right.onPress()
        dispatch(setPayFromFederationId(activeFederation.id))
        navigation.navigate(offline ? 'SendOfflineAmount' : 'Send')
    }

    return (
        <Flex row gap="lg">
            <Button
                bubble
                disabled={leftDisabled}
                onPress={handleLeft}
                icon={<SvgImage name="ArrowDown" />}
                title={
                    <Text bold caption numberOfLines={1}>
                        {left.label ?? t('words.receive')}
                    </Text>
                }
                titleStyle={style.buttonTitle}
                containerStyle={style.buttonContainer}
                buttonStyle={style.button}
            />
            <Button
                bubble
                disabled={rightDisabled}
                onPress={handleRight}
                icon={<SvgImage name="ArrowUpRight" />}
                title={
                    <Text bold caption numberOfLines={1}>
                        {right.label ?? t('words.send')}
                    </Text>
                }
                containerStyle={style.buttonContainer}
                buttonStyle={style.button}
            />
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        buttonContainer: {
            flex: 1,
        },
        buttonTitle: {
            color: theme.colors.primary,
            letterSpacing: -0.14,
            paddingLeft: theme.spacing.xl,
            gap: theme.spacing.xl,
        },
        button: {
            gap: theme.spacing.sm,
        },
    })

export default WalletButtons
