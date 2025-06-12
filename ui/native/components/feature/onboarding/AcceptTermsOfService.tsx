import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'
import Hyperlink from 'react-native-hyperlink'

import { getFederationTosUrl } from '@fedi/common/utils/FederationUtils'

import { JoinPreview } from '../../../types'
import Flex from '../../ui/Flex'

export type Props = {
    federation: JoinPreview
    onAccept: () => void | Promise<void>
    onReject: () => void | Promise<void>
}

const AcceptTermsOfService: React.FC<Props> = ({
    federation,
    onAccept,
    onReject,
}: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const [isAccepting, setIsAccepting] = useState(false)
    const [isRejecting, setIsRejecting] = useState(false)
    const tosUrl = getFederationTosUrl(federation.meta)

    const style = styles(theme)

    return (
        <Flex grow center style={style.container}>
            <Text h2 medium h2Style={style.title}>
                {t('feature.onboarding.terms-and-conditions')}
            </Text>

            <View style={style.guidance}>
                <Hyperlink
                    onPress={url => Linking.openURL(url)}
                    linkStyle={style.linkText}>
                    <Text>
                        {t('feature.onboarding.by-clicking-i-accept', {
                            tos_url: tosUrl,
                        })}
                    </Text>
                </Hyperlink>
            </View>

            <Flex align="center" fullWidth style={style.buttonsContainer}>
                <Button
                    fullWidth
                    title={t('feature.onboarding.i-accept')}
                    onPress={async () => {
                        setIsAccepting(true)
                        try {
                            await onAccept()
                        } catch {
                            setIsAccepting(false)
                        }
                    }}
                    containerStyle={style.button}
                    loading={isAccepting}
                    disabled={isRejecting}
                />
                <Button
                    fullWidth
                    type="clear"
                    title={t('feature.onboarding.i-do-not-accept')}
                    onPress={async () => {
                        setIsRejecting(true)
                        await onReject()
                        setIsRejecting(false)
                    }}
                    containerStyle={style.button}
                    loading={isRejecting}
                    disabled={isAccepting}
                />
            </Flex>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.xl,
        },
        button: {
            marginVertical: theme.sizes.xxs,
        },
        buttonsContainer: {
            paddingTop: theme.spacing.md,
            width: '100%',
            alignItems: 'center',
        },
        guidance: {
            marginTop: 'auto',
            marginBottom: theme.spacing.lg,
        },
        title: {
            marginBottom: theme.spacing.lg,
            textAlign: 'left',
            alignSelf: 'flex-start',
        },
        linkText: {
            color: theme.colors.link,
        },
    })

export default AcceptTermsOfService
