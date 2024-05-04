import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import { useToast } from '@fedi/common/hooks/toast'
import {
    joinChatGroup,
    selectActiveFederationId,
    selectChatConnectionOptions,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'
import { decodeDirectChatLink } from '@fedi/common/utils/xmpp'

import CameraPermissionsRequired from '../components/feature/scan/CameraPermissionsRequired'
import QrCodeScanner from '../components/feature/scan/QrCodeScanner'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('ScanMemberCode')

export type Props = NativeStackScreenProps<RootStackParamList, 'ScanMemberCode'>

const ScanMemberCode: React.FC<Props> = ({ navigation }: Props) => {
    const insets = useSafeAreaInsets()
    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const connectionOptions = useAppSelector(selectChatConnectionOptions)
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const dispatch = useAppDispatch()

    const handleUserInput = useCallback(
        async (input: string) => {
            if (!activeFederationId) return
            if (input.startsWith('fedi:member:')) {
                log.info('fedi chat member detected', input)
                // TODO: show chat unavailable
                if (!connectionOptions) {
                    return toast.show({
                        content: t('errors.chat-unavailable'),
                        status: 'error',
                    })
                }
                const memberUsername = decodeDirectChatLink(input)
                const { domain } = connectionOptions

                navigation.replace('DirectChat', {
                    memberId: `${memberUsername}@${domain}`,
                })
            } else if (input.startsWith('fedi:group:')) {
                log.info('fedi chat group detected', input)
                try {
                    const res = await dispatch(
                        joinChatGroup({
                            federationId: activeFederationId,
                            link: input,
                        }),
                    ).unwrap()
                    navigation.replace('GroupChat', {
                        groupId: res.id,
                    })
                } catch (error) {
                    toast.show({
                        content: t('errors.chat-unavailable'),
                        status: 'error',
                    })
                }
            } else {
                toast.show({
                    content: t('feature.chat.invalid-member'),
                    status: 'error',
                })
            }
        },
        [activeFederationId, connectionOptions, dispatch, navigation, t, toast],
    )

    const renderQrCodeScanner = () => {
        return (
            <QrCodeScanner
                onQrCodeDetected={(qrCodeData: string) => {
                    handleUserInput(qrCodeData)
                }}
            />
        )
    }

    return (
        <CameraPermissionsRequired
            alternativeActionButton={null}
            message={t('feature.chat.camera-access-information')}>
            <View style={styles(theme, insets).container}>
                <View style={styles(theme, insets).cameraScannerContainer}>
                    {renderQrCodeScanner()}
                </View>
            </View>
        </CameraPermissionsRequired>
    )
}

const styles = (theme: Theme, insets: EdgeInsets) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingTop: theme.spacing.lg,
        },
        // flex: 0 takes only the space it needs to render the buttons while
        // flex: 1 makes sure to take the remaining available space
        cameraScannerContainer: {
            flex: 1,
            width: '100%',
        },
        buttonsContainer: {
            flex: 0,
            justifyContent: 'flex-end',
            paddingHorizontal: theme.spacing.xl,
            width: '100%',
            marginTop: theme.spacing.xl,
            marginBottom: theme.spacing.xl + insets.bottom,
        },
        // adds space between the 2 buttons
        bottomButton: {
            marginTop: theme.spacing.lg,
        },
    })

export default ScanMemberCode
