import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { MutableRefObject } from 'react'
import { StyleSheet } from 'react-native'
import WebView from 'react-native-webview'

import { FediMod } from '@fedi/common/types'

import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'

type FediModBrowserHeaderProps = {
    webViewRef: MutableRefObject<WebView>
    fediMod: FediMod
}

const FediModBrowserHeader: React.FC<FediModBrowserHeaderProps> = ({
    webViewRef,
    fediMod,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const navigation = useNavigation()

    return (
        <>
            <Header
                containerStyle={style.container}
                headerLeft={
                    <>
                        <PressableIcon
                            svgName="ChevronLeft"
                            containerStyle={style.arrow}
                            hitSlop={10}
                            onPress={() => webViewRef.current.goBack()}
                        />
                        <PressableIcon
                            svgName="ChevronRight"
                            containerStyle={style.arrow}
                            hitSlop={10}
                            onPress={() => webViewRef.current.goForward()}
                        />
                    </>
                }
                headerCenter={
                    <Text
                        caption
                        medium
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={style.titleText}>
                        {fediMod.title}
                    </Text>
                }
                centerContainerStyle={style.titleContainer}
                leftContainerStyle={style.leftContainer}
                rightContainerStyle={style.rightContainer}
                closeButton
                onClose={() => navigation.goBack()}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            borderBottomColor: theme.colors.lightGrey,
            paddingHorizontal: theme.spacing.xs,
        },
        leftContainer: {
            gap: theme.spacing.md,
            paddingVertical: theme.spacing.lg,
            flex: 0,
            flexShrink: 0,
        },
        rightContainer: {
            flex: 0,
            flexShrink: 0,
        },
        titleContainer: {
            flexGrow: 1,
            alignItems: 'center',
        },
        arrow: {
            paddingHorizontal: 0,
            paddingVertical: 0,
        },
        titleText: {
            textAlign: 'center',
            lineHeight: 24,
        },
    })

export default FediModBrowserHeader
