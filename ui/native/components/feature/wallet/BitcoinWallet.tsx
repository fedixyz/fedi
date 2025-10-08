import { useNavigation } from '@react-navigation/native'
import { useTheme, type Theme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'
import { LinearGradientProps } from 'react-native-linear-gradient'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectIsInternetUnreachable,
    selectReceivesDisabled,
    setPayFromFederationId,
} from '@fedi/common/redux'
import { LoadedFederation } from '@fedi/common/types'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import { BubbleCard } from '../../ui/BubbleView'
import WalletButtons from './WalletButtons'
import WalletHeader from './WalletHeader'

type Props = {
    federation?: LoadedFederation
}

const BitcoinWallet: React.FC<Props> = ({ federation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const receivesDisabled = useAppSelector(s =>
        selectReceivesDisabled(s, federation?.id || ''),
    )
    const isOffline = useAppSelector(selectIsInternetUnreachable)

    const style = styles(theme)

    if (!federation) return null

    const gradientProps: LinearGradientProps = {
        colors: [...fediTheme.dayLinearGradient],
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
    }

    const handleReceive = () => {
        if (receivesDisabled) {
            toast.show({
                content: t('errors.receives-have-been-disabled'),
                status: 'error',
            })
        } else {
            dispatch(setPayFromFederationId(federation.id))
            navigation.navigate('ReceiveLightning', {
                federationId: federation.id,
            })
        }
    }

    const handleSend = () => {
        dispatch(setPayFromFederationId(federation.id))
        if (isOffline) {
            navigation.navigate('SendOfflineAmount')
        } else {
            navigation.navigate('Send', {
                federationId: federation.id,
            })
        }
    }

    return (
        <BubbleCard
            linearGradientProps={gradientProps}
            containerStyle={style.card}>
            <WalletHeader federation={federation} />
            <WalletButtons
                federation={federation}
                incoming={{
                    onPress: handleReceive,
                    disabled: receivesDisabled,
                }}
                outgoing={{
                    onPress: handleSend,
                    disabled: federation.balance < 1000,
                }}
                history={{
                    onPress: () =>
                        navigation.navigate('Transactions', {
                            federationId: federation.id,
                        }),
                }}
            />
        </BubbleCard>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            backgroundColor: theme.colors.lightGrey,
            borderWidth: 1,
            borderColor: theme.colors.lightGrey,
        },
    })

export default BitcoinWallet
