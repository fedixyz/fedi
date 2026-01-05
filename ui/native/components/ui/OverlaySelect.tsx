import { Text, Theme, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import CustomOverlay from './CustomOverlay'
import { Column } from './Flex'
import SvgImage from './SvgImage'

type Props = {
    value: string
    options: Array<{ value: string; label: string }>
    onValueChange: (value: string) => void
}

const OverlaySelect: React.FC<Props> = ({ value, options, onValueChange }) => {
    const [isOpen, setIsOpen] = useState(false)

    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)
    const currentOption = options.find(o => o.value === value)

    return (
        <>
            <Pressable style={style.container} onPress={() => setIsOpen(true)}>
                <Text medium caption>
                    {t('phrases.filter-by', {
                        label: currentOption?.label,
                    })}
                </Text>
                <SvgImage name="ChevronDown" size={20} />
            </Pressable>
            <CustomOverlay
                show={isOpen}
                onBackdropPress={() => setIsOpen(false)}
                contents={{
                    body: (
                        <Column style={style.options}>
                            {options.map(option => (
                                <Pressable
                                    key={option.value}
                                    style={style.option}
                                    onPress={() => {
                                        onValueChange(option.value)
                                        setIsOpen(false)
                                    }}>
                                    <Text bold>{option.label}</Text>
                                    {option.value === value && (
                                        <SvgImage size={20} name="Check" />
                                    )}
                                </Pressable>
                            ))}
                        </Column>
                    ),
                }}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            borderRadius: 24,
            borderWidth: 1.5,
            borderColor: theme.colors.lightGrey,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
        },
        options: {
            padding: theme.spacing.md,
        },
        option: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.sm,
            paddingVertical: theme.spacing.lg,
        },
    })

export default OverlaySelect
