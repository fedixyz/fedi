import { Text, Theme, useTheme } from '@rneui/themed'
import { Pressable, StyleSheet } from 'react-native'

import { Row } from '../../ui/Flex'
import GradientView from '../../ui/GradientView'
import SvgImage, { SvgImageName } from '../../ui/SvgImage'

export default function HeaderOverlayOption({
    onPress,
    text,
    icon,
}: {
    onPress: () => void
    text: string
    icon: SvgImageName
}) {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Pressable onPress={onPress}>
            <Row align="center" justify="between">
                <Row align="center" gap="md">
                    <GradientView variant="black" style={style.optionIcon}>
                        <SvgImage
                            name={icon}
                            size={24}
                            color={theme.colors.white}
                        />
                    </GradientView>
                    <Text medium>{text}</Text>
                </Row>
                <SvgImage
                    name="ChevronRight"
                    size={24}
                    color={theme.colors.grey}
                />
            </Row>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingHorizontal: theme.spacing.lg,
            display: 'flex',
            gap: theme.spacing.xs,
            paddingBottom: theme.spacing.md,
        },
        headerContainer: {
            paddingHorizontal: 0,
        },
        optionIcon: {
            width: 40,
            height: 40,
            borderRadius: 12,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
        },
    })
