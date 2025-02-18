import { useFocusEffect } from '@react-navigation/native'
import { Button, useTheme, Theme, Text } from '@rneui/themed'
import React, { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View, Linking } from 'react-native'
import * as Zendesk from 'react-native-zendesk-messaging'

import { usePushNotificationToken } from '@fedi/common/hooks/matrix'
import { ToastHandler, useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'
import SvgImage from '@fedi/native/components/ui/SvgImage'

import { HELP_URL, PRIVACY_POLICY_URL } from '../../../constants'
import { useSupportPermission, useNpub } from '../../../utils/hooks/support'
import { zendeskInitialize, useDisplayName } from '../../../utils/support'
import HoloGuidance from '../../ui/HoloGuidance'

const log = makeLog('SupportChat')

type SupportChatProps = {
    zendeskInitialized: boolean
    setZendeskInitialized: (value: boolean) => void
}

const SupportChat: React.FC<SupportChatProps> = ({
    zendeskInitialized,
    setZendeskInitialized,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()

    const style = styles(theme)

    const {
        supportPermissionGranted,
        grantPermission,
        zendeskPushNotificationToken,
        savePushNotificationToken,
    } = useSupportPermission()
    const pushNotificationToken = usePushNotificationToken()
    const nostrPublic = useNpub()
    const nostrNpub = nostrPublic ?? null
    const displayName = useDisplayName()

    useEffect(() => {
        if (nostrNpub && displayName && !zendeskInitialized) {
            zendeskInitialize(
                nostrNpub,
                displayName,
                setZendeskInitialized,
                toast as unknown as ToastHandler,
                t,
            )
        }
    }, [
        nostrNpub,
        displayName,
        setZendeskInitialized,
        zendeskInitialized,
        toast,
        t,
    ])

    useFocusEffect(
        useCallback(() => {
            if (zendeskInitialized && supportPermissionGranted) {
                Zendesk.openMessagingView()
                    .then(() =>
                        log.debug('Zendesk messaging shown successfully'),
                    )
                    .catch(error => {
                        log.error('Zendesk messaging failed to show', error)
                        toast.error(
                            t,
                            error,
                            'feature.support.zendesk-initialization-failed',
                        )
                    })
            }
        }, [zendeskInitialized, supportPermissionGranted, toast, t]),
    )

    useEffect(() => {
        if (
            supportPermissionGranted &&
            pushNotificationToken &&
            pushNotificationToken !== zendeskPushNotificationToken
        ) {
            Zendesk.updatePushNotificationToken(pushNotificationToken)
            savePushNotificationToken(pushNotificationToken)
            log.debug(
                'Zendesk push notification token updated: ' +
                    pushNotificationToken,
            )
        }
    }, [
        supportPermissionGranted,
        pushNotificationToken,
        zendeskPushNotificationToken,
        savePushNotificationToken,
    ])

    const handlePrivacyPolicyPress = () => {
        Linking.openURL(PRIVACY_POLICY_URL)
    }

    const grantSupportPermission = () => {
        if (!supportPermissionGranted) {
            grantPermission()
        }
    }

    const handleZendeskPress = () => {
        if (!supportPermissionGranted) {
            grantPermission()
        } else {
            Zendesk.openMessagingView()
                .then(() => log.debug('Zendesk messaging shown successfully'))
                .catch(error =>
                    log.error('Zendesk messaging failed to show', error),
                )
        }
    }

    const handleHelpCenterPress = () => {
        Linking.openURL(HELP_URL)
    }

    return (
        <View
            style={[
                style.container,
                { backgroundColor: theme.colors.background },
            ]}>
            <View style={style.content}>
                <HoloGuidance
                    iconImage={<SvgImage name="Bulb" size={86} />}
                    title={t('feature.support.friendly-request')}
                    body={null}
                    noFlexContainer={true}
                />
                <View style={{ marginTop: -14 }}>
                    <Text style={[styles(theme).message]}>
                        {t('feature.support.effective-support-1a')}
                        <Text
                            style={[style.linkText]}
                            onPress={handlePrivacyPolicyPress}>
                            {t('feature.support.effective-support-info')}
                        </Text>
                        <Text>{t('feature.support.effective-support-1b')}</Text>
                    </Text>
                    <Text style={[styles(theme).message, { marginTop: 22 }]}>
                        {t('feature.support.effective-support-2a')}
                        <Text
                            style={[style.linkText]}
                            onPress={handleHelpCenterPress}>
                            {t('feature.support.effective-support-help-center')}
                        </Text>
                        <Text>{t('feature.support.effective-support-2b')}</Text>
                    </Text>
                </View>
            </View>
            <View style={style.overlayButtonsContainer}>
                <Button
                    fullWidth
                    onPress={
                        supportPermissionGranted
                            ? handleZendeskPress
                            : grantSupportPermission
                    }
                    title={
                        supportPermissionGranted
                            ? t('feature.support.open-chat')
                            : t('phrases.i-understand')
                    }
                />
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
        },
        message: {
            textAlign: 'center',
            paddingHorizontal: theme.spacing.xl,
            fontWeight: '400',
        },
        content: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingLeft: '3%',
            paddingRight: '3%',
        },
        overlayButtonsContainer: {
            width: '100%',
            paddingHorizontal: 20,
            marginBottom: 30,
        },
        linkText: {
            textDecorationLine: 'underline',
            color: theme.colors.blue,
        },
    })

export default SupportChat
