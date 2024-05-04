import Clipboard from '@react-native-clipboard/clipboard'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import stringUtils from '@fedi/common/utils/StringUtils'

import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

interface BaseProps {
    label: React.ReactNode
    noBorder?: boolean
    onPress?: () => void
}

interface StringProps extends BaseProps {
    value: string
    truncated?: boolean
    copyable?: boolean
    copiedMessage?: string
}

interface ReactNodeProps extends BaseProps {
    value: React.ReactElement
}

export type HistoryDetailItemProps = StringProps | ReactNodeProps

const isStringProps = (props: HistoryDetailItemProps): props is StringProps =>
    typeof props.value === 'string'

export const HistoryDetailItem: React.FC<HistoryDetailItemProps> = props => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()

    const style = styles(theme)

    let valueEl: React.ReactNode
    if (isStringProps(props)) {
        valueEl = (
            <Text caption>
                {props.truncated
                    ? stringUtils.truncateMiddleOfString(props.value, 5)
                    : props.value}
            </Text>
        )
        if (props.copyable) {
            valueEl = (
                <Pressable
                    hitSlop={5}
                    style={style.copyPressable}
                    onPress={() => {
                        Clipboard.setString(props.value)
                        toast.show({
                            content:
                                props.copiedMessage ||
                                t('phrases.copied-to-clipboard'),
                            status: 'success',
                        })
                    }}>
                    {valueEl}
                    <SvgImage name="Copy" size={SvgImageSize.xs} />
                </Pressable>
            )
        }
    } else {
        valueEl = props.value
    }

    const containerStyle = [
        style.container,
        props.noBorder ? {} : style.containerBorder,
    ]
    if (props.onPress) {
        return (
            <Pressable style={containerStyle} onPress={props.onPress}>
                <Text caption medium>
                    {props.label}
                </Text>
                {valueEl}
            </Pressable>
        )
    } else {
        return (
            <View style={containerStyle}>
                <Text caption medium>
                    {props.label}
                </Text>
                {valueEl}
            </View>
        )
    }
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            minHeight: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        containerBorder: {
            paddingBottom: theme.spacing.md,
            marginBottom: theme.spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.extraLightGrey,
        },
        copyPressable: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
    })
