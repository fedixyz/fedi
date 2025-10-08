import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { selectLastSelectedCommunity } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import { isNightly } from '../../../utils/device-info'
import Flex from '../../ui/Flex'
import GradientView from '../../ui/GradientView'
import Header from '../../ui/Header'
import MainHeaderButtons from '../../ui/MainHeaderButtons'
import TotalBalance from '../../ui/TotalBalance'
import CommunitySelector from '../federations/CommunitySelector'
import SelectedCommunity from '../federations/SelectedCommunity'

const HomeHeader: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const showNightlyBanner = useMemo(() => isNightly(), [])
    const selectedCommunity = useAppSelector(selectLastSelectedCommunity)

    const style = styles(theme)

    const openJoinCommunity = () => {
        // TODO: make sure there is a back button on this next screen to match designs
        navigation.navigate('PublicCommunities')
    }

    return (
        <GradientView variant="sky" style={style.container}>
            <Flex gap="md" style={style.contentContainer}>
                <Flex gap="xs">
                    <Header
                        transparent
                        containerStyle={style.headerContainer}
                        headerLeft={<CommunitySelector />}
                        headerRight={
                            <MainHeaderButtons onAddPress={openJoinCommunity} />
                        }
                    />
                    <TotalBalance />
                </Flex>
                {/* TODO: restore this on federations screen */}
                {/* <NetworkBanner /> */}
                {showNightlyBanner && (
                    <View style={style.nightly}>
                        <Text
                            small
                            style={style.nightlyText}
                            adjustsFontSizeToFit>
                            {t('feature.developer.nightly')}
                        </Text>
                    </View>
                )}
                {selectedCommunity && (
                    <SelectedCommunity community={selectedCommunity} />
                )}
            </Flex>
        </GradientView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 16,
        },
        contentContainer: {
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.lg,
        },
        headerContainer: {
            justifyContent: 'center',
            paddingHorizontal: 0,
        },
        nightly: {
            position: 'absolute',
            bottom: 0,
            right: theme.spacing.lg,
            backgroundColor: theme.colors.primary,
            paddingHorizontal: theme.spacing.sm,
            borderTopLeftRadius: 5,
            borderTopRightRadius: 5,
        },
        nightlyText: {
            fontSize: 10,
            color: theme.colors.secondary,
        },
    })

export default HomeHeader
