import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useLnurlReceiveCode } from '@fedi/common/hooks/pay'
import { selectActiveFederationId } from '@fedi/common/redux'

import { fedimint } from '../bridge'
import ReceiveQr from '../components/feature/receive/ReceiveQr'
import { SafeScrollArea } from '../components/ui/SafeArea'
import { useAppSelector } from '../state/hooks'
import { BitcoinOrLightning, BtcLnUri } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'ReceiveLnurl'>

const ReceiveLnurl: React.FC<Props> = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const activeFederationId = useAppSelector(selectActiveFederationId)

    const { lnurlReceiveCode, isLoading } = useLnurlReceiveCode(
        fedimint,
        activeFederationId || '',
    )

    const style = styles(theme)

    return (
        <SafeScrollArea edges="notop">
            <View style={style.reusableNotice}>
                <Text
                    color={theme.colors.primary}
                    style={style.noticeTitle}
                    medium
                    caption>
                    ℹ️ {t('feature.receive.lnurl-receive-notice-1')}
                </Text>
                <Text
                    color={theme.colors.darkGrey}
                    style={style.noticeText}
                    small>
                    {t('feature.receive.lnurl-receive-notice-2')}
                </Text>
            </View>
            {isLoading || !lnurlReceiveCode ? (
                <ActivityIndicator />
            ) : (
                <ReceiveQr
                    uri={
                        new BtcLnUri({
                            type: BitcoinOrLightning.lnurl,
                            body: lnurlReceiveCode || '',
                        })
                    }
                    type={BitcoinOrLightning.lnurl}
                    transactionId={lnurlReceiveCode}
                />
            )}
        </SafeScrollArea>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingHorizontal: theme.spacing.lg,
        },
        infoSection: {
            padding: theme.spacing.md,
            borderRadius: 12,
            width: '100%',
        },
        description: {
            textAlign: 'center',
            lineHeight: 18,
        },
        qrCard: {
            display: 'flex',
            borderRadius: 15,
            width: '100%',
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.xl,
            paddingBottom: theme.spacing.xs,
        },
        uriContainer: {
            paddingTop: theme.spacing.md,
        },
        uri: {
            lineHeight: 18,
        },
        receiverSection: {
            width: '100%',
            gap: theme.spacing.sm,
        },
        sendFromRow: {
            marginTop: theme.spacing.xs,
        },
        avatar: {
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: theme.colors.grey,
        },
        communityAvatar: {
            backgroundColor: theme.colors.primary,
        },
        button: {
            width: '48%',
        },
        detailsGroup: {
            width: '100%',
            marginTop: 'auto',
        },
        buttonText: {
            color: theme.colors.secondary,
        },
        collapsedContainer: {
            height: 0,
            opacity: 0,
        },
        detailsContainer: {
            width: '100%',
            opacity: 1,
        },
        detailItem: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 52,
        },
        detailItemTitle: {
            marginRight: 'auto',
        },
        reusableNotice: {
            backgroundColor: theme.colors.offWhite100,
            padding: theme.spacing.md,
            gap: theme.spacing.xxs,
            borderRadius: 8,
        },
        noticeTitle: {
            marginBottom: theme.spacing.xs,
            textAlign: 'center',
        },
        noticeText: {
            textAlign: 'center',
        },
    })

export default ReceiveLnurl
