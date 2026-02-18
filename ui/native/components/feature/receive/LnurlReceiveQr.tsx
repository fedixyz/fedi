import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useLnurlReceiveCode } from '@fedi/common/hooks/receive'
import { selectLoadedFederation } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { BitcoinOrLightning, BtcLnUri } from '../../../types'
import { Column, Row } from '../../ui/Flex'
import { FederationLogo } from '../federations/FederationLogo'
import ReceiveQr from './ReceiveQr'

export default function LnurlReceiveQr({
    federationId = '',
}: {
    federationId?: string
}) {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    const { lnurlReceiveCode, isLoading } = useLnurlReceiveCode(federationId)

    const uri = new BtcLnUri({
        type: BitcoinOrLightning.lnurl,
        body: lnurlReceiveCode || '',
    })

    const style = styles(theme)

    return (
        <Column grow gap="xl">
            <Column style={style.noticeContainer}>
                <Column style={style.reusableNotice}>
                    <Text color={theme.colors.primary} medium center caption>
                        ℹ️ {t('feature.receive.lnurl-receive-notice-1')}
                    </Text>
                    <Text color={theme.colors.darkGrey} center small>
                        {t('feature.receive.lnurl-receive-notice-2')}
                    </Text>
                </Column>
            </Column>
            <ReceiveQr uri={uri} isLoading={isLoading || !lnurlReceiveCode}>
                <Row fullWidth align="center" justify="between">
                    <Text caption bold color={theme.colors.night}>{`${t(
                        'feature.receive.receive-to',
                    )}`}</Text>
                    <Row align="center" gap="xs">
                        <FederationLogo federation={federation} size={24} />

                        <Text
                            caption
                            medium
                            numberOfLines={1}
                            color={theme.colors.night}>
                            {federation?.name || ''}
                        </Text>
                    </Row>
                </Row>
            </ReceiveQr>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
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
