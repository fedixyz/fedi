import { useNavigation } from '@react-navigation/native'
import { Button, useTheme, Theme, Text } from '@rneui/themed'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View, Linking } from 'react-native'

import { grantSupportPermission } from '@fedi/common/redux/support'
import SvgImage from '@fedi/native/components/ui/SvgImage'

import { HELP_URL, PRIVACY_POLICY_URL } from '../../../constants'
import { useAppDispatch } from '../../../state/hooks'
import { useLaunchZendesk } from '../../../utils/hooks/support'
import { Column } from '../../ui/Flex'
import HoloGuidance from '../../ui/HoloGuidance'
import { SafeAreaContainer } from '../../ui/SafeArea'

const SupportChat: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation()
    const style = styles(theme)
    const dispatch = useAppDispatch()

    const { launchZendesk } = useLaunchZendesk()

    const handlePrivacyPolicyPress = () => {
        Linking.openURL(PRIVACY_POLICY_URL)
    }

    const grantPermission = useCallback(() => {
        dispatch(grantSupportPermission())
        launchZendesk(true)
        // Close the Permission screen while the modal opens
        navigation.goBack()
    }, [dispatch, launchZendesk, navigation])

    const handleHelpCenterPress = () => {
        Linking.openURL(HELP_URL)
    }

    return (
        <SafeAreaContainer edges="bottom">
            <Column grow style={[{ backgroundColor: theme.colors.background }]}>
                <Column center grow style={style.content}>
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
                            <Text>
                                {t('feature.support.effective-support-1b')}
                            </Text>
                        </Text>
                        <Text
                            style={[styles(theme).message, { marginTop: 22 }]}>
                            {t('feature.support.effective-support-2a')}
                            <Text
                                style={[style.linkText]}
                                onPress={handleHelpCenterPress}>
                                {t(
                                    'feature.support.effective-support-help-center',
                                )}
                            </Text>
                            <Text>
                                {t('feature.support.effective-support-2b')}
                            </Text>
                        </Text>
                    </View>
                </Column>
                <View style={style.overlayButtonsContainer}>
                    <Button
                        fullWidth
                        onPress={grantPermission}
                        title={t('phrases.i-understand')}
                    />
                </View>
            </Column>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        message: {
            textAlign: 'center',
            paddingHorizontal: theme.spacing.xl,
            fontWeight: '400',
        },
        content: {
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
