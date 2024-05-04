import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import {
    useFederationPreview,
    useLatestPublicFederations,
} from '@fedi/common/hooks/federation'
import { selectMatrixAuth } from '@fedi/common/redux'

import { fedimint } from '../bridge'
import {
    OmniInput,
    OmniInputAction,
} from '../components/feature/omni/OmniInput'
import FederationPreview from '../components/feature/onboarding/FederationPreview'
import { CameraPermissionGate } from '../components/feature/permissions/CameraPermissionGate'
import { useAppSelector } from '../state/hooks'
import { ParserDataType } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'JoinFederation'>

const JoinFederation: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const invite = route?.params?.invite
    const isFocused = useIsFocused()
    const hasMatrixAuth = useAppSelector(s => !!selectMatrixAuth(s))
    const { publicFederations } = useLatestPublicFederations()
    const {
        isJoining,
        isFetchingPreview,
        federationPreview,
        setFederationPreview,
        handleCode,
        handleJoin,
    } = useFederationPreview(t, fedimint, invite || '')

    // // Reset preview when leaving the screen
    // useEffect(() => {
    //     return () => {
    //         setFederationPreview(undefined)
    //     }
    // }, [setFederationPreview])

    const goToNextScreen = useCallback(() => {
        if (!federationPreview) return
        navigation.replace(hasMatrixAuth ? 'TabsNavigator' : 'EnterDisplayName')
    }, [federationPreview, hasMatrixAuth, navigation])

    // If they came here with route state, paste the code for them
    useEffect(() => {
        if (!invite || !isFocused) return
        // skip handling the code if we already have a preview
        if (federationPreview) return
        handleCode(invite, goToNextScreen)
    }, [federationPreview, invite, handleCode, isFocused, goToNextScreen])

    const renderQrCodeScanner = () => {
        if (isJoining || isFetchingPreview) {
            return <ActivityIndicator />
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
                onJoin={() => handleJoin(goToNextScreen)}
                onBack={() => setFederationPreview(undefined)}
                federation={federationPreview}
            />
        )
    }

    return <View style={styles().container}>{renderQrCodeScanner()}</View>
}

const styles = () =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
    })

export default JoinFederation
