import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { selectLoadedFederations } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import GradientView from '../../ui/GradientView'
import Header from '../../ui/Header'
import MainHeaderButtons from '../../ui/MainHeaderButtons'
import NightlyBuildBanner from '../../ui/NightlyBuildBanner'
import TotalBalance from '../../ui/TotalBalance'
import SelectWalletOverlay from '../send/SelectWalletOverlay'

const WalletHeader: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const loadedFederations = useAppSelector(selectLoadedFederations)

    const [open, setOpen] = useState(false)

    const style = styles(theme)

    const openJoinCommunity = () => {
        // TODO: make sure there is a back button on this next screen to match designs
        navigation.navigate('PublicFederations')
    }

    return (
        <GradientView variant="sky" style={style.container}>
            <Header
                transparent
                containerStyle={style.headerContainer}
                headerLeft={
                    <Text h2 medium>
                        {t('words.wallet')}
                    </Text>
                }
                headerRight={
                    <MainHeaderButtons
                        onAddPress={openJoinCommunity}
                        onMenuPress={
                            loadedFederations.length >= 2
                                ? () => setOpen(true)
                                : undefined
                        }
                    />
                }
            />
            <TotalBalance />

            {/* TODO: restore this on federations screen */}
            {/* <NetworkBanner /> */}
            <NightlyBuildBanner />
            <SelectWalletOverlay open={open} onDismiss={() => setOpen(false)} />
        </GradientView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingHorizontal: theme.spacing.lg,
            display: 'flex',
            gap: theme.spacing.xs,
            paddingBottom: theme.spacing.md,
        },
        headerContainer: {
            justifyContent: 'center',
            paddingHorizontal: 0,
        },
    })

export default WalletHeader
