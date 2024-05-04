import { useNavigation } from '@react-navigation/native'
import type { Theme } from '@rneui/themed'
import { useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View, useWindowDimensions } from 'react-native'

import { selectFederationFediMods } from '@fedi/common/redux'

import { FediModImages } from '../../../assets/images'
import { useAppSelector } from '../../../state/hooks'
import { navigate } from '../../../state/navigation'
import { Screen, Shortcut, FediMod } from '../../../types'
import { NavigationHook } from '../../../types/navigation'
import ShortcutTile from './ShortcutTile'

const ShortcutsList: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const fediMods = useAppSelector(selectFederationFediMods)
    const { width, fontScale } = useWindowDimensions()

    const columns = width / fontScale < 300 ? 2 : 3
    const style = styles(theme, columns)

    const screenShortcuts: Screen[] = useMemo(
        () => [
            // TODO: Refactor Screen to not be a class from Base, this is not typesafe.
            // It could be missing required properties and TypeScript would not throw!
            new Screen({
                id: 'bug-report',
                title: t('feature.bug.report-a-bug'),
                screenName: 'BugReport',
                icon: {
                    image: FediModImages['bug-report'],
                },
            }),
        ],
        [t],
    )

    const onSelectFediMod = (shortcut: Shortcut) => {
        const fediMod = shortcut as FediMod
        // Handle telegram and whatsapp links natively
        if (
            fediMod.url.includes('https://t.me') ||
            fediMod.url.includes('https://wa.me')
        ) {
            Linking.openURL(fediMod.url)
        } else {
            navigation.navigate('FediModBrowser', { fediMod })
        }
    }

    const onSelectScreen = (shortcut: Shortcut) => {
        const screen = shortcut as Screen
        navigation.dispatch(navigate(screen.screenName))
    }

    const renderFediModShortcuts = () => {
        const fediModShortcuts = fediMods.map(s => new FediMod(s))
        return fediModShortcuts.map((s: FediMod, i: number) => {
            return (
                <View key={`fediMod-s-${i}`} style={style.shortcut}>
                    <ShortcutTile shortcut={s} onSelect={onSelectFediMod} />
                </View>
            )
        })
    }

    const renderScreenShortcuts = () => {
        return screenShortcuts.map((s: Screen, i: number) => {
            return (
                <View key={`screen-s-${i}`} style={style.shortcut}>
                    <ShortcutTile shortcut={s} onSelect={onSelectScreen} />
                </View>
            )
        })
    }

    // There is flexbox complexity in centering rows with 3 tiles
    // while also left-justifying rows with 1 or 2 tiles so we just
    // make sure to fill the remaining space with invisible elements
    const renderBuffers = () => {
        const totalShortcuts = fediMods.length + screenShortcuts.length
        const bufferCount = columns - (totalShortcuts % columns)

        return new Array(bufferCount).fill('').map((b, i) => {
            return (
                <View
                    key={`buffer-s-${i}`}
                    style={[style.shortcut, style.buffer]}
                />
            )
        })
    }

    return (
        <View style={style.container}>
            <View style={style.listContainer}>
                {renderFediModShortcuts()}
                {renderScreenShortcuts()}
                {renderBuffers()}
            </View>
        </View>
    )
}

const styles = (theme: Theme, columns: number) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
            marginVertical: theme.spacing.xl,
        },
        shortcut: {
            width: `${100 / columns}%`,
        },
        buffer: {
            height: theme.sizes.lg,
        },
        listContainer: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
        },
    })

export default ShortcutsList
