import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'
import Hyperlink from 'react-native-hyperlink'

import { getFederationTosUrl } from '@fedi/common/utils/FederationUtils'

import { JoinPreview } from '../../../types'

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

    return (
        <View style={styles(theme).container}>
            <Text h2 medium h2Style={styles(theme).title}>
                {t('feature.onboarding.terms-and-conditions')}
            </Text>

            <View style={styles(theme).guidance}>
                <Hyperlink
                    onPress={url => Linking.openURL(url)}
                    linkStyle={styles(theme).linkText}>
                    <Text>
                        {t('feature.onboarding.by-clicking-i-accept', {
                            tos_url: tosUrl,
                        })}
                    </Text>
                </Hyperlink>
            </View>

            <View style={styles(theme).buttonsContainer}>
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
                    containerStyle={styles(theme).button}
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
                    containerStyle={styles(theme).button}
                    loading={isRejecting}
                    disabled={isAccepting}
                />
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
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
        termsContainer: {
            width: '100%',
        },
        title: {
            marginBottom: theme.spacing.lg,
            textAlign: 'left',
            alignSelf: 'flex-start',
        },
        linkText: {
            color: theme.colors.link,
        },
        content: {
            textAlign: 'left',
            lineHeight: 20,
        },
    })

export default AcceptTermsOfService
