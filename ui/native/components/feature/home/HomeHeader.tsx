import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo, useState } from 'react'
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
import CommunitiesOverlay from '../federations/CommunitiesOverlay'
import SelectedCommunity from '../federations/SelectedCommunity'

const HomeHeader: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const showNightlyBanner = useMemo(() => isNightly(), [])
    const selectedCommunity = useAppSelector(selectLastSelectedCommunity)
    const [showCommunities, setShowCommunities] = useState(false)

    const style = styles(theme)

    const openJoinCommunity = () => {
        // TODO: make sure there is a back button on this next screen to match designs
        navigation.navigate('PublicCommunities')
    }

    return (
        <View style={style.container}>
            <GradientView variant="sky" style={style.gradientHeader}>
                <Flex gap="md" style={style.contentContainer}>
                    <Flex gap="xs">
                        <Header
                            transparent
                            containerStyle={style.headerContainer}
                            headerLeft={
                                <Text
                                    h2
                                    medium
                                    numberOfLines={1}
                                    adjustsFontSizeToFit>
                                    {t('words.communities')}
                                </Text>
                            }
                            headerRight={
                                <MainHeaderButtons
                                    onAddPress={openJoinCommunity}
                                    onShowCommunitiesPress={() =>
                                        setShowCommunities(true)
                                    }
                                />
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
                </Flex>
            </GradientView>
            {selectedCommunity && (
                <View style={style.selectedCommunityContainer}>
                    <SelectedCommunity community={selectedCommunity} />
                </View>
            )}

            <CommunitiesOverlay
                open={showCommunities}
                onOpenChange={setShowCommunities}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            borderBottomColor: theme.colors.extraLightGrey,
            borderBottomWidth: 1,
        },
        gradientHeader: {},
        contentContainer: {
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.lg,
        },
        headerContainer: {
            justifyContent: 'center',
            paddingHorizontal: 0,
        },
        selectedCommunityContainer: {
            padding: theme.spacing.lg,
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
