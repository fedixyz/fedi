import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import Flex from '../../ui/Flex'
import GradientView from '../../ui/GradientView'
import HoloCircle from '../../ui/HoloCircle'
import { SafeAreaContainer } from '../../ui/SafeArea'
import SvgImage, { SvgImageName, SvgImageSize } from '../../ui/SvgImage'

interface Props {
    icon: SvgImageName
    title: React.ReactNode
    descriptionIcons: SvgImageName[]
    descriptionText: React.ReactNode
    onContinue: () => void
    alternativeActionButton?: React.ReactNode
}

export const PermissionGate: React.FC<Props> = ({
    icon,
    title,
    descriptionIcons,
    descriptionText,
    onContinue,
    alternativeActionButton,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <SafeAreaContainer style={style.container} edges="notop">
            <Flex grow center gap="lg">
                <HoloCircle
                    content={<SvgImage name={icon} size={SvgImageSize.md} />}
                    size={72}
                />
                <Text h2 medium style={style.title}>
                    {title}:
                </Text>
                <GradientView
                    variant="sky-banner"
                    style={style.descriptionContainer}>
                    <Flex row center gap="sm">
                        {descriptionIcons.map(name => (
                            <SvgImage
                                key={name}
                                name={name}
                                size={SvgImageSize.sm}
                            />
                        ))}
                    </Flex>
                    <Text medium style={style.descriptionText}>
                        {descriptionText}
                    </Text>
                </GradientView>
                <Text caption style={style.disclaimer}>
                    {t('feature.permissions.update-later-disclaimer')}
                </Text>
            </Flex>
            <View style={style.actions}>
                {alternativeActionButton}
                <Button
                    testID="ContinueButton"
                    fullWidth
                    title={t('words.continue')}
                    onPress={() => onContinue()}
                />
            </View>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            width: '100%',
        },
        title: {
            textAlign: 'center',
        },
        descriptionContainer: {
            width: '100%',
            gap: theme.spacing.sm,
            padding: theme.spacing.lg,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.borders.defaultRadius,
        },
        descriptionText: {
            textAlign: 'center',
            maxWidth: 280,
        },
        disclaimer: {
            textAlign: 'center',
            color: theme.colors.darkGrey,
        },
        actions: {
            flexShrink: 0,
            gap: 8,
        },
    })
