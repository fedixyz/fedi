import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import {
    useFederationPreview,
    useLatestPublicFederations,
} from '@fedi/common/hooks/federation'
import { makeLog } from '@fedi/common/utils/log'

import {
    OmniInput,
    OmniInputAction,
} from '../components/feature/omni/OmniInput'
import CommunityPreview from '../components/feature/onboarding/CommunityPreview'
import FederationPreview from '../components/feature/onboarding/FederationPreview'
import { HelpTextLoadingAnimation } from '../components/feature/onboarding/HelpTextLoadingAnimation'
import { CameraPermissionGate } from '../components/feature/permissions/CameraPermissionGate'
import { Column } from '../components/ui/Flex'
import { reset, resetToHomeWithScreen } from '../state/navigation'
import { ParserDataType } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'JoinFederation'>
const log = makeLog('JoinFederation')

const JoinFederation: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const invite = route?.params?.invite
    const afterJoinEcash = route?.params?.afterJoinEcash
    const afterJoinUrl = route?.params?.afterJoinUrl
    const isFocused = useIsFocused()
    const { publicFederations } = useLatestPublicFederations()
    const {
        isJoining,
        setIsJoining,
        isFetchingPreview,
        federationPreview,
        setFederationPreview,
        communityPreview,
        setCommunityPreview,
        handleCode,
        handleJoin,
    } = useFederationPreview(t, invite || '')

    // // Reset preview when leaving the screen
    useEffect(() => {
        return () => {
            if (communityPreview) setCommunityPreview(undefined)
            else setFederationPreview(undefined)
            setFederationPreview(undefined)
        }
    }, [communityPreview, setCommunityPreview, setFederationPreview])

    const handleReject = useCallback(() => {
        setIsJoining(false)
        try {
            // If the last screen was public federations/communities, reset to it
            if (navigation.canGoBack()) navigation.goBack()
            // fall back to the TabsNavigator based on preview type
            else
                navigation.dispatch(
                    reset('TabsNavigator', {
                        initialRouteName: communityPreview ? 'Home' : 'Wallet',
                    }),
                )
        } catch (error) {
            log.error('Error rejecting join', error)
        }
    }, [communityPreview, navigation, setIsJoining])

    const goToNextScreen = useCallback(() => {
        const homeTab = federationPreview ? 'Wallet' : 'Home'

        // After-join actions work even when already joined (no preview needed)
        if (afterJoinEcash) {
            navigation.dispatch(
                resetToHomeWithScreen(homeTab as 'Home' | 'Wallet', {
                    name: 'ClaimEcash',
                    params: { id: afterJoinEcash },
                }),
            )
            return
        }
        if (afterJoinUrl) {
            navigation.dispatch(
                resetToHomeWithScreen(homeTab as 'Home' | 'Wallet', {
                    name: 'FediModBrowser',
                    params: { url: afterJoinUrl },
                }),
            )
            return
        }

        if (!federationPreview && !communityPreview) return

        navigation.replace('TabsNavigator', {
            initialRouteName: homeTab,
        })
    }, [
        federationPreview,
        communityPreview,
        navigation,
        afterJoinEcash,
        afterJoinUrl,
    ])

    // If they came here with route state, paste the code for them
    useEffect(() => {
        if (!invite || !isFocused) return
        // skip handling the code if we already have a preview
        if (federationPreview || communityPreview) return
        handleCode(invite, goToNextScreen)
    }, [
        federationPreview,
        communityPreview,
        invite,
        handleCode,
        isFocused,
        goToNextScreen,
    ])

    const style = styles(theme)

    const renderQrCodeScanner = () => {
        if (isJoining || isFetchingPreview) {
            return (
                <Column grow center style={style.loadingContainer}>
                    <HelpTextLoadingAnimation />
                </Column>
            )
        } else {
            const customActions: OmniInputAction[] =
                publicFederations.length > 0
                    ? [
                          {
                              label: t('phrases.view-public-federations'),
                              icon: 'FedimintLogo',
                              onPress: () =>
                                  navigation.navigate('PublicFederations'),
                          },
                      ]
                    : []
            return (
                <CameraPermissionGate>
                    <OmniInput
                        expectedInputTypes={[ParserDataType.FedimintInvite]}
                        onExpectedInput={input =>
                            handleCode(input.data.invite, goToNextScreen)
                        }
                        onUnexpectedSuccess={() => null}
                        pasteLabel={t(
                            'feature.federations.paste-federation-code',
                        )}
                        customActions={customActions}
                    />
                </CameraPermissionGate>
            )
        }
    }

    if (federationPreview) {
        return (
            <FederationPreview
                isJoining={isJoining}
                onJoin={recoverFromScratch => {
                    if (recoverFromScratch)
                        log.info(
                            `Recovering from scratch. (federation id: ${federationPreview.id})`,
                        )
                    handleJoin(goToNextScreen, recoverFromScratch)
                }}
                onBack={handleReject}
                federation={federationPreview}
            />
        )
    }

    if (communityPreview) {
        return (
            <CommunityPreview
                isJoining={isJoining}
                onJoin={() => {
                    handleJoin(goToNextScreen)
                }}
                onBack={handleReject}
                community={communityPreview}
            />
        )
    }

    return <View style={style.container}>{renderQrCodeScanner()}</View>
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        loadingContainer: {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: 3,
            paddingBottom: 3,
            transform: [{ scale: 2 }],
        },
    })

export default JoinFederation
