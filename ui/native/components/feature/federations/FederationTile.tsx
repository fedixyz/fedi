import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { useNavigation } from '@react-navigation/native'
import { Text, useTheme, type Theme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Pressable, View } from 'react-native'

import { selectIsFederationRecovering } from '@fedi/common/redux'
import { LoadedFederation } from '@fedi/common/types'

import { useAppSelector } from '../../../state/hooks'
import {
    TabsNavigatorParamList,
    RootStackParamList,
    NavigationHook,
} from '../../../types/navigation'
import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import HomeWallets from '../home/HomeWallets'
import RecoveryInProgress from '../recovery/RecoveryInProgress'
import { FederationLogo } from './FederationLogo'

export type Props = BottomTabScreenProps<
    TabsNavigatorParamList & RootStackParamList,
    'Federations'
>

const FederationTile: React.FC<{ federation: LoadedFederation }> = ({
    federation,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const style = styles(theme)
    const recoveryInProgress = useAppSelector(s =>
        selectIsFederationRecovering(s, federation.id),
    )

    const goToFederationDetails = () => {
        navigation.navigate('FederationDetails', {
            federationId: federation.id,
        })
    }

    return (
        <Flex gap="md">
            <Pressable
                style={style.tileContainer}
                onPress={goToFederationDetails}>
                <FederationLogo federation={federation} size={48} />
                <Text bold style={style.title}>
                    {federation?.name}
                </Text>
                <SvgImage
                    name="ChevronRight"
                    color={theme.colors.grey}
                    containerStyle={style.icon}
                    size={SvgImageSize.sm}
                />
            </Pressable>
            {recoveryInProgress ? (
                <View style={style.recovery}>
                    <RecoveryInProgress
                        label={t(
                            'feature.recovery.recovery-in-progress-balance',
                        )}
                        federationId={federation.id}
                    />
                </View>
            ) : (
                <HomeWallets federation={federation} />
            )}
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        tileContainer: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        icon: {
            marginLeft: 'auto',
        },
        recovery: {
            minHeight: theme.sizes.walletCardHeight,
            borderRadius: 20,
            borderColor: theme.colors.extraLightGrey,
        },
        title: {
            color: theme.colors.primary,
        },
    })

export default FederationTile
