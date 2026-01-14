import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectAuthenticatedGuardian,
    socialRecoveryDownloadVerificationDoc,
} from '@fedi/common/redux'
import { ParserDataType } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'

import { OmniInput } from '../components/feature/omni/OmniInput'
import { Column } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('ScanSocialRecoveryCode')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ScanSocialRecoveryCode'
>

const ScanSocialRecoveryCode: React.FC<Props> = ({ navigation }: Props) => {
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const { t } = useTranslation()
    const toast = useToast()
    const authenticatedGuardian = useAppSelector(selectAuthenticatedGuardian)

    const style = styles(theme)

    const handleUserInput = async (data: { recoveryId: string }) => {
        if (!authenticatedGuardian?.federationId) return

        try {
            const videoPath = await dispatch(
                socialRecoveryDownloadVerificationDoc({
                    fedimint,
                    recoveryId: data.recoveryId,
                    peerId: authenticatedGuardian.peerId,
                    federationId: authenticatedGuardian.federationId,
                }),
            ).unwrap()

            if (videoPath == null) {
                toast.show(t('feature.recovery.nothing-to-download'))
            } else {
                navigation.navigate('CompleteRecoveryAssist', {
                    videoPath: videoPath as string,
                    recoveryId: data.recoveryId,
                })
            }
        } catch (e) {
            log.error("Couldn't download video", e)
            toast.show({
                content: t('feature.recovery.download-failed'),
                status: 'error',
            })
        }
    }

    return (
        <SafeAreaContainer edges={'bottom'}>
            <Column style={style.container}>
                <Column align="center" gap="md" grow style={style.content}>
                    <Text center style={style.title}>
                        {t('feature.recovery.recovery-assist-scan-title')}
                    </Text>
                    <Text numberOfLines={2} center style={style.subtitle}>
                        {t('feature.recovery.recovery-assist-scan-subtitle')}
                    </Text>
                    <OmniInput
                        expectedInputTypes={[ParserDataType.FedimintRecovery]}
                        onExpectedInput={input => handleUserInput(input.data)}
                        onUnexpectedSuccess={() => null}
                    />
                </Column>
            </Column>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            padding: theme.spacing.lg,
        },
        content: {},
        title: {
            fontSize: 24,
            fontWeight: '500',
        },
        subtitle: {
            color: theme.colors.darkGrey,
            fontSize: 15,
        },
    })

export default ScanSocialRecoveryCode
