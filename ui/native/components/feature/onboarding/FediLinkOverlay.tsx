import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import CustomOverlay from '../../ui/CustomOverlay'
import { Column, Row } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

interface Props {
    show: boolean
    onDismiss: () => void
    onConfirm: () => void
    onReject: () => void
}

const FediLinkOverlay: React.FC<Props> = ({
    show,
    onDismiss,
    onConfirm,
    onReject,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    return (
        <CustomOverlay
            show={show}
            onBackdropPress={onDismiss}
            contents={{
                body: (
                    <Column gap="lg" fullWidth>
                        <Column align="center" fullWidth>
                            <SvgImage name="FediLogoDark" size="xl" />
                            <Text medium h4 center>
                                {t(
                                    'feature.onboarding.did-you-come-from-fedi-link',
                                )}
                            </Text>
                        </Column>
                        <Row gap="md" fullWidth>
                            <View style={style.buttonContainer}>
                                <Button fullWidth day onPress={onReject}>
                                    {t('words.no')}
                                </Button>
                            </View>
                            <View style={style.buttonContainer}>
                                <Button fullWidth day onPress={onConfirm}>
                                    {t('words.yes')}
                                </Button>
                            </View>
                        </Row>
                    </Column>
                ),
            }}
        />
    )
}

const styles = (_theme: Theme) =>
    StyleSheet.create({
        buttonContainer: {
            flex: 1,
        },
    })

export default FediLinkOverlay
