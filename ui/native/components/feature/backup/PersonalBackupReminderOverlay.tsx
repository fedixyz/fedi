import { useNavigation } from '@react-navigation/native'
import { Button, Text } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { Image, StyleSheet } from 'react-native'

import { usePersonalBackupReminder } from '@fedi/common/hooks/personalBackupReminder'

import { Images } from '../../../assets/images'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column } from '../../ui/Flex'

interface Props {
    open: boolean
    onDismiss: () => void
}

const PersonalBackupReminderOverlay: React.FC<Props> = ({
    open,
    onDismiss,
}) => {
    const { t } = useTranslation()
    const navigation = useNavigation()
    const { shouldShow, dismissForSession } = usePersonalBackupReminder()

    const handleBackup = () => {
        dismissForSession()
        navigation.navigate('RecoveryWords', { returnToOrigin: true })
        onDismiss()
    }

    const handleDismiss = () => {
        dismissForSession()
        onDismiss()
    }

    return (
        <CustomOverlay
            show={shouldShow && open}
            contents={{
                body: (
                    <Column gap="xl" align="center" fullWidth>
                        <Image
                            source={Images.ProfileSecurityIcon}
                            style={style.icon}
                        />
                        <Text h2 medium style={style.title}>
                            {t('feature.backup.personal-backup-reminder-title')}
                        </Text>
                        <Column gap="md" align="center" fullWidth>
                            <Button fullWidth onPress={handleBackup}>
                                {t(
                                    'feature.backup.personal-backup-reminder-action',
                                )}
                            </Button>
                            <Button
                                fullWidth
                                text
                                onPress={handleDismiss}
                                testID="BackupReminderDismissButton">
                                {t('phrases.not-now')}
                            </Button>
                        </Column>
                    </Column>
                ),
            }}
        />
    )
}

const style = StyleSheet.create({
    icon: {
        width: 64,
        height: 64,
    },
    title: {
        textAlign: 'center',
        width: '100%',
    },
})

export default PersonalBackupReminderOverlay
