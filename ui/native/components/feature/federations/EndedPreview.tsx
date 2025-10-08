import { Text, Theme, useTheme } from '@rneui/themed'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { RpcFederationPreview } from '@fedi/common/types/bindings'

import { LoadedFederation } from '../../../types'
import Flex from '../../ui/Flex'
import { FederationLogo } from './FederationLogo'

export default function FederationEndedPreview({
    popupInfo,
    federation,
}: {
    popupInfo: ReturnType<typeof usePopupFederationInfo>
    federation: LoadedFederation | RpcFederationPreview
}) {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const style = styles(theme)

    return (
        <Flex grow center style={style.content}>
            <View style={style.contentSpacing}>
                <FederationLogo federation={federation} size={72} />
            </View>
            <Text h2 style={style.contentSpacing}>
                {federation?.name}
            </Text>
            <View style={[style.ended, style.contentSpacing]}>
                <Text caption bold>
                    {t('feature.popup.ended')}
                </Text>
            </View>
            <Text caption style={{ textAlign: 'center' }}>
                {popupInfo?.endedMessage || (
                    <Trans
                        t={t}
                        i18nKey="feature.popup.ended-description"
                        values={{ date: popupInfo?.endsAtText }}
                        components={{ bold: <Text caption bold /> }}
                    />
                )}
            </Text>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        content: {
            width: '90%',
            maxWidth: 280,
            margin: 'auto',
        },
        contentSpacing: {
            marginBottom: theme.spacing.lg,
        },
        ended: {
            paddingVertical: theme.spacing.xxs,
            paddingHorizontal: theme.spacing.sm,
            backgroundColor: theme.colors.lightGrey,
            color: theme.colors.primary,
            borderRadius: 30,
        },
    })
