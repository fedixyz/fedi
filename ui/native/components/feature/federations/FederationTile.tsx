import { useNavigation } from '@react-navigation/native'
import { Text, useTheme, type Theme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Pressable, View } from 'react-native'

import {
    usePopupFederationInfo,
    useShouldShowStabilityPool,
} from '@fedi/common/hooks/federation'
import { selectIsFederationRecovering } from '@fedi/common/redux'
import { LoadedFederation } from '@fedi/common/types'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import RecoveryInProgress from '../recovery/RecoveryInProgress'
import StabilityWallet from '../stabilitypool/StabilityWallet'
import BitcoinWallet from '../wallet/BitcoinWallet'
import { FederationLogo } from './FederationLogo'

interface Props {
    federation: LoadedFederation
    expanded: boolean
    setExpandedWalletId: (id: string | null) => void
}

const FederationTile: React.FC<Props> = ({
    federation,
    expanded,
    setExpandedWalletId,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const style = styles(theme)
    const recoveryInProgress = useAppSelector(s =>
        selectIsFederationRecovering(s, federation.id),
    )
    const popupInfo = usePopupFederationInfo(federation?.meta ?? {})
    const showStabilityWallet = useShouldShowStabilityPool(federation.id)

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
                <View style={style.logoContainer}>
                    <FederationLogo federation={federation} size={48} />
                    {popupInfo?.ended && (
                        <View style={style.endedIndicator}>
                            <SvgImage
                                name="ExclamationCircle"
                                size={16}
                                color={theme.colors.red}
                            />
                        </View>
                    )}
                </View>
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
                <>
                    <BitcoinWallet
                        federation={federation}
                        expanded={expanded}
                        setExpandedWalletId={setExpandedWalletId}
                    />
                    {showStabilityWallet && (
                        <StabilityWallet
                            federation={federation}
                            expanded={expanded}
                            setExpandedWalletId={setExpandedWalletId}
                        />
                    )}
                </>
            )}
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        logoContainer: {
            position: 'relative',
            width: 48,
            height: 48,
        },
        endedIndicator: {
            position: 'absolute',
            top: -6,
            right: -6,
            backgroundColor: theme.colors.white,
            borderRadius: 1024,
            alignItems: 'center',
            justifyContent: 'center',
        },
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
