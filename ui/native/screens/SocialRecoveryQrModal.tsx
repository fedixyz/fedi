import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Dimensions,
    Pressable,
    StyleSheet,
    View,
} from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import Flex from '../components/ui/Flex'
import HoloCard from '../components/ui/HoloCard'
import QRCode from '../components/ui/QRCode'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('SocialRecoveryQrModal')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'SocialRecoveryQrModal'
>

const QR_CODE_SIZE = Dimensions.get('window').width * 0.7

const SocialRecoveryQrModal: React.FC<Props> = ({ navigation }: Props) => {
    const toast = useToast()
    const { theme } = useTheme()
    const { t } = useTranslation()
    const [recoveryQrCode, setRecoveryQrCode] = useState<string>('')

    useEffect(() => {
        const getRecoveryAssistCode = async () => {
            try {
                const recoveryAssistCode = await fedimint.recoveryQr()
                log.info('recoveryAssistCode', recoveryAssistCode)
                setRecoveryQrCode(JSON.stringify(recoveryAssistCode))
            } catch (error) {
                log.error('getRecoveryAssistCode', error)
                toast.error(t, error)
            }
        }

        getRecoveryAssistCode()
    }, [navigation, toast, t])

    const style = styles(theme)

    return (
        <Flex grow center style={style.container}>
            <Pressable
                style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
                ]}
                onPress={navigation.goBack}
            />
            <Flex row justify="center" style={style.qrCodeContainer}>
                {recoveryQrCode ? (
                    <QRCode value={recoveryQrCode} size={QR_CODE_SIZE} />
                ) : (
                    <ActivityIndicator />
                )}
            </Flex>
            <View style={style.holoCardContainer}>
                <HoloCard
                    body={
                        <Text bold style={style.instructionsText}>
                            {t('feature.recovery.guardian-qr-instructions')}
                        </Text>
                    }
                />
            </View>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
        },
        holoCardContainer: {
            paddingVertical: theme.spacing.md,
            width: '90%',
        },
        instructionsText: {
            fontWeight: '400',
            textAlign: 'center',
        },
        qrCodeContainer: {
            borderRadius: theme.borders.defaultRadius,
            padding: QR_CODE_SIZE * 0.05,
            backgroundColor: theme.colors.white,
            flexDirection: 'row',
            justifyContent: 'center',
        },
    })

export default SocialRecoveryQrModal
