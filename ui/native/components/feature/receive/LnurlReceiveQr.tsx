import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'

import { useLnurlReceiveCode } from '@fedi/common/hooks/receive'

import { BitcoinOrLightning, BtcLnUri } from '../../../types'
import { Column } from '../../ui/Flex'
import ReceiveQr from './ReceiveQr'

export default function LnurlReceiveQr({
    federationId = '',
}: {
    federationId?: string
}) {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const { lnurlReceiveCode, isLoading } = useLnurlReceiveCode(federationId)

    const uri = new BtcLnUri({
        type: BitcoinOrLightning.lnurl,
        body: lnurlReceiveCode || '',
    })

    const style = styles(theme)

    return (
        <ScrollView style={style.container}>
            <Column grow gap="xl">
                <Column style={style.noticeContainer}>
                    <Column style={style.reusableNotice}>
                        <Text
                            color={theme.colors.primary}
                            medium
                            center
                            caption>
                            ℹ️ {t('feature.receive.lnurl-receive-notice-1')}
                        </Text>
                        <Text color={theme.colors.darkGrey} center small>
                            {t('feature.receive.lnurl-receive-notice-2')}
                        </Text>
                    </Column>
                </Column>
                <ReceiveQr
                    uri={uri}
                    isLoading={isLoading || !lnurlReceiveCode}
                />
            </Column>
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
        },
        noticeContainer: {
            paddingHorizontal: theme.spacing.xl,
        },
        reusableNotice: {
            backgroundColor: theme.colors.offWhite100,
            padding: theme.spacing.md,
            gap: theme.spacing.xxs,
            borderRadius: 8,
        },
    })
