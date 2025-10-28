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
import { useNuxStep } from '@fedi/common/hooks/nux'
import { selectMatrixAuth } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import {
    OmniInput,
    OmniInputAction,
} from '../components/feature/omni/OmniInput'
import CommunityPreview from '../components/feature/onboarding/CommunityPreview'
import FederationPreview from '../components/feature/onboarding/FederationPreview'
import { HelpTextLoadingAnimation } from '../components/feature/onboarding/HelpTextLoadingAnimation'
import { CameraPermissionGate } from '../components/feature/permissions/CameraPermissionGate'
import Flex from '../components/ui/Flex'
import { useAppSelector } from '../state/hooks'
import { ParserDataType } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'JoinFederation'>
const log = makeLog('JoinFederation')

const JoinFederation: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const invite = route?.params?.invite
    const isFocused = useIsFocused()
    const hasMatrixAuth = useAppSelector(s => !!selectMatrixAuth(s))
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
    } = useFederationPreview(t, fedimint, invite || '')
    const [hasPerformedPersonalBackup] = useNuxStep(
        'hasPerformedPersonalBackup',
    )

    // // Reset preview when leaving the screen
    // useEffect(() => {
    //     return () => {
    //         setFederationPreview(undefined)
    //     }
    // }, [setFederationPreview])

    const goToNextScreen = useCallback(() => {
        if (!federationPreview && !communityPreview) return

        // Take them to the Personal Backup screen if this is a federation preview and they haven't backed up before
        if (federationPreview && !hasPerformedPersonalBackup) {
            return navigation.navigate('RecoveryWords', { isFromJoin: true })
        }

        if (hasMatrixAuth) {
            navigation.replace('TabsNavigator', {
                initialRouteName: federationPreview ? 'Federations' : 'Home',
            })
        } else {
            navigation.replace('EnterDisplayName')
        }
    }, [
        federationPreview,
        communityPreview,
        hasMatrixAuth,
        hasPerformedPersonalBackup,
        navigation,
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
                <Flex grow center style={style.loadingContainer}>
                    <HelpTextLoadingAnimation />
                </Flex>
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
                onBack={() => {
                    setIsJoining(false)
                    setFederationPreview(undefined)
                    // navigation.getState()?.routes?.length || 0) > 1
                    //     ? navigation.goBack()
                    //     : navigation.reset({
                    //           index: 0,
                    //           routes: [{ name: 'TabsNavigator' }],
                    //       }
                }}
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
                onBack={() => {
                    setIsJoining(false)
                    setCommunityPreview(undefined)
                    // navigation.getState()?.routes?.length || 0) > 1
                    //     ? navigation.goBack()
                    //     : navigation.reset({
                    //           index: 0,
                    //           routes: [{ name: 'TabsNavigator' }],
                    //       }
                }}
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
