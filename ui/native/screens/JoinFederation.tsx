import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import {
    useIsChatSupported,
    useLatestPublicFederations,
} from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    joinFederation,
    selectFederationIds,
    setActiveFederationId,
} from '@fedi/common/redux'
import { getFederationPreview } from '@fedi/common/utils/FederationUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import {
    OmniInput,
    OmniInputAction,
} from '../components/feature/omni/OmniInput'
import FederationPreview from '../components/feature/onboarding/FederationPreview'
import { CameraPermissionGate } from '../components/feature/permissions/CameraPermissionGate'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import {
    FederationPreview as FederationPreviewType,
    ParserDataType,
} from '../types'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('JoinFederation')

export type Props = NativeStackScreenProps<RootStackParamList, 'JoinFederation'>

const JoinFederation: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const invite = route?.params?.invite
    const isFocused = useIsFocused()
    const [isFetchingPreview, setIsFetchingPreview] = useState(!!invite)
    const [isJoining, setIsJoining] = useState<boolean>(false)
    const [federationPreview, setFederationPreview] =
        useState<FederationPreviewType>()
    const isChatSupported = useIsChatSupported(federationPreview)
    const federationIds = useAppSelector(selectFederationIds)
    const navigationRef = useUpdatingRef(navigation)
    const { publicFederations } = useLatestPublicFederations()

    const handleCode = useCallback(
        async (code: string) => {
            setIsFetchingPreview(true)
            try {
                const fed = await getFederationPreview(code, fedimint)
                if (federationIds.includes(fed.id)) {
                    dispatch(setActiveFederationId(fed.id))
                    navigationRef.current.replace('TabsNavigator')
                    toast.show({
                        content: t('errors.you-have-already-joined'),
                        status: 'error',
                    })
                } else {
                    setFederationPreview(fed)
                }
            } catch (err) {
                log.error('handleCode', err)
                toast.error(t, err, 'errors.invalid-federation-code')
            }
            setIsFetchingPreview(false)
        },
        [federationIds, dispatch, navigationRef, t, toast],
    )

    // If they came here with route state, paste the code for them
    useEffect(() => {
        if (!invite || !isFocused) return
        // skip handling the code if we already have a preview
        if (federationPreview) return
        handleCode(invite)
    }, [federationPreview, invite, handleCode, isFocused])

    const goToNextScreen = useCallback(() => {
        if (!federationPreview) return
        navigation.replace(isChatSupported ? 'CreateUsername' : 'TabsNavigator')
    }, [federationPreview, isChatSupported, navigation])

    const handleJoin = useCallback(async () => {
        setIsJoining(true)
        try {
            if (!federationPreview) throw new Error()
            await dispatch(
                joinFederation({
                    fedimint,
                    code: federationPreview.inviteCode,
                }),
            ).unwrap()
            goToNextScreen()
        } catch (err) {
            // TODO: Expect an error code from bridge that maps to
            // a localized error message
            log.error('handleJoin', err)
            const typedError = err as Error
            // This catches specific errors caused by:
            // 1. leaving a federation immediately before... After
            // force-quitting, joining again is successful so advise
            // the user here
            // 2. scanning a federation code after you already joined
            if (typedError?.message?.includes('No record locks available')) {
                toast.show({
                    content: t('errors.please-force-quit-the-app'),
                    status: 'error',
                })
            } else {
                toast.error(t, typedError, 'errors.failed-to-join-federation')
            }
            setIsJoining(false)
        }
    }, [dispatch, federationPreview, goToNextScreen, t, toast])

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
                        onExpectedInput={input => handleCode(input.data.invite)}
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
                onJoin={handleJoin}
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
