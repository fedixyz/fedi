import { Text, Theme, useTheme } from '@rneui/themed'
import { Dispatch, SetStateAction, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { RpcFederationPreview } from '@fedi/common/types/bindings'
import { isDev } from '@fedi/common/utils/environment'

import { LoadedFederation } from '../../../types'
import { isNightly } from '../../../utils/device-info'
import { Column } from '../../ui/Flex'
import { FederationLogo } from './FederationLogo'

export default function FederationEndedPreview({
    popupInfo,
    federation,
    setJoinAnyways,
}: {
    popupInfo: ReturnType<typeof usePopupFederationInfo>
    federation: LoadedFederation | RpcFederationPreview
    setJoinAnyways: Dispatch<SetStateAction<boolean>>
}) {
    const [, setClicks] = useState(0)
    const { theme } = useTheme()
    const { t } = useTranslation()

    const style = styles(theme)

    return (
        <Column grow center style={style.content}>
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
                        components={{
                            bold: (
                                <Text
                                    caption
                                    bold
                                    onPress={() => {
                                        if (isNightly() || isDev())
                                            setClicks(c => {
                                                if (c >= 21)
                                                    setJoinAnyways(true)

                                                return c + 1
                                            })
                                    }}
                                />
                            ),
                        }}
                    />
                )}
            </Text>
        </Column>
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
