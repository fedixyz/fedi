import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import {
    selectCommunities,
    selectLastSelectedCommunity,
} from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import GradientView from '../../ui/GradientView'
import Header from '../../ui/Header'
import MainHeaderButtons from '../../ui/MainHeaderButtons'
import NightlyBuildBanner from '../../ui/NightlyBuildBanner'
import TotalBalance from '../../ui/TotalBalance'
import SelectedCommunity from '../federations/SelectedCommunity'

type Props = {
    onOpenCommunitiesOverlay: () => void
}

const HomeHeader: React.FC<Props> = ({ onOpenCommunitiesOverlay }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const communities = useAppSelector(selectCommunities)
    const selectedCommunity = useAppSelector(selectLastSelectedCommunity)

    const style = styles(theme)

    const openJoinCommunity = () => {
        // TODO: make sure there is a back button on this next screen to match designs
        navigation.navigate('PublicCommunities')
    }

    return (
        <>
            <GradientView variant="sky" style={style.container}>
                <Header
                    transparent
                    containerStyle={style.headerContainer}
                    headerLeft={
                        <Text h2 medium numberOfLines={1} adjustsFontSizeToFit>
                            {t('words.spaces')}
                        </Text>
                    }
                    headerRight={
                        <MainHeaderButtons
                            onAddPress={openJoinCommunity}
                            onMenuPress={
                                communities.length >= 2
                                    ? onOpenCommunitiesOverlay
                                    : undefined
                            }
                        />
                    }
                />
                <TotalBalance />

                {/* TODO: restore this on federations screen */}
                {/* <NetworkBanner /> */}
                <NightlyBuildBanner />
            </GradientView>
            {selectedCommunity && (
                <View style={style.selectedCommunityContainer}>
                    <SelectedCommunity community={selectedCommunity} />
                </View>
            )}
        </>
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
        selectedCommunityContainer: {
            borderBottomColor: theme.colors.extraLightGrey,
            borderBottomWidth: 1,
            paddingVertical: theme.spacing.xs,
            paddingHorizontal: theme.spacing.sm,
        },
    })

export default HomeHeader
