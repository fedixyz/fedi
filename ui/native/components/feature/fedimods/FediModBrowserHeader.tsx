import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { MutableRefObject } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import WebView from 'react-native-webview'

import { FediMod } from '@fedi/common/types'

import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type FediModBrowserHeaderProps = {
    webViewRef: MutableRefObject<WebView>
    fediMod: FediMod
}

const FediModBrowserHeader: React.FC<FediModBrowserHeaderProps> = ({
    webViewRef,
    fediMod,
}) => {
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const style = styles(theme)

    return (
        <Header
            containerStyle={{ borderBottomColor: theme.colors.lightGrey }}
            headerLeft={
                <View style={style.horizontalContainer}>
                    <Pressable
                        onPress={() => webViewRef.current.goBack()}
                        hitSlop={10}
                        style={style.arrow}>
                        <SvgImage size={SvgImageSize.md} name="ChevronLeft" />
                    </Pressable>
                    <Pressable
                        onPress={() => webViewRef.current.goForward()}
                        hitSlop={10}
                        style={[style.arrow, style.rightArrow]}>
                        <SvgImage size={SvgImageSize.md} name="ChevronRight" />
                    </Pressable>
                </View>
            }
            headerCenter={
                <View style={style.titleContainer}>
                    <Text
                        caption
                        medium
                        numberOfLines={1}
                        style={style.titleText}>
                        {fediMod.title}
                    </Text>
                </View>
            }
            headerRight={
                <Pressable
                    style={style.close}
                    hitSlop={10}
                    onPress={() => navigation.goBack()}>
                    <SvgImage size={SvgImageSize.md} name="Close" />
                </Pressable>
            }
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        horizontalContainer: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        arrow: {
            paddingVertical: theme.spacing.lg,
        },
        rightArrow: {
            marginLeft: theme.spacing.lg,
        },
        titleContainer: {
            flex: 1,
            paddingHorizontal: theme.spacing.md,
        },
        titleText: {
            width: '100%',
            textAlign: 'center',
            lineHeight: 24,
        },
        webln: {
            paddingVertical: theme.spacing.md,
            opacity: 0,
        },
        inactive: {
            opacity: 0.5,
        },
        close: {
            paddingVertical: theme.spacing.md,
        },
    })

export default FediModBrowserHeader
