import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { selectLatestAwareReleaseTag } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { openAppStore } from '../../../utils/release'
import { Column, Row } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

export default function AppUpdateWidget() {
    const latestReleaseTag = useAppSelector(selectLatestAwareReleaseTag)

    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <Row gap="md" align="center" style={style.card}>
            <Row center style={style.phoneIcon}>
                <SvgImage name="PhoneDownload" />
                <View style={style.notificationDot} />
            </Row>
            <Column grow>
                <Text medium>{t('feature.updates.new-app-version')}</Text>
                <Text caption color={theme.colors.darkGrey}>
                    {t('feature.updates.version-is-available', {
                        version: latestReleaseTag,
                    })}
                </Text>
            </Column>
            <Button
                title={t('words.update')}
                onPress={openAppStore}
                size="sm"
            />
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            padding: theme.spacing.md,
            borderWidth: 1,
            borderColor: theme.colors.extraLightGrey,
            borderRadius: 20,
        },
        phoneIcon: {
            width: 48,
            height: 48,
            borderWidth: 1,
            borderColor: theme.colors.extraLightGrey,
            borderRadius: 12,
            position: 'relative',
            overflow: 'visible',
        },
        notificationDot: {
            position: 'absolute',
            width: 14,
            height: 14,
            top: 0,
            right: -6,
            backgroundColor: theme.colors.red,
            borderRadius: 8,
        },
    })
