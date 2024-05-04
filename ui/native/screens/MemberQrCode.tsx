import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { selectAuthenticatedMember } from '@fedi/common/redux'
import { encodeDirectChatLink } from '@fedi/common/utils/xmpp'

import QRScreen from '../components/ui/QRScreen'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'MemberQrCode'>

const MemberQrCode: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const member = useAppSelector(selectAuthenticatedMember)

    if (!member) return null

    const directChatLink = encodeDirectChatLink(member.username)

    const goToScanMemberCode = () => {
        navigation.navigate('ScanMemberCode')
    }

    return (
        <QRScreen
            title={member.username}
            subtitle={t('feature.chat.scan-member-code-notice')}
            qrValue={directChatLink}
            copyValue={directChatLink}
            copyMessage={t('phrases.copied-member-code')}
            bottom={
                <Button
                    fullWidth
                    buttonStyle={styles(theme).button}
                    titleStyle={styles(theme).buttonText}
                    containerStyle={styles(theme).buttonContainer}
                    title={t('feature.chat.open-camera-scanner')}
                    icon={<SvgImage name="Scan" color={theme.colors.primary} />}
                    onPress={goToScanMemberCode}
                />
            }
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        buttonContainer: {
            marginTop: 'auto',
        },
        button: {
            backgroundColor: theme.colors.secondary,
        },
        buttonText: {
            color: theme.colors.primary,
        },
    })

export default MemberQrCode
