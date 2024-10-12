import { useNavigation } from '@react-navigation/native'
import type { Theme } from '@rneui/themed'
import { useTheme } from '@rneui/themed'
import React from 'react'
import { Linking, StyleSheet, View, useWindowDimensions } from 'react-native'

import { selectActiveFederationFediMods } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { FediMod, Shortcut } from '../../../types'
import { NavigationHook } from '../../../types/navigation'
import ShortcutTile from './ShortcutTile'

const ShortcutsList: React.FC = () => {
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const fediMods = useAppSelector(selectActiveFederationFediMods)
    const { width, fontScale } = useWindowDimensions()

    const columns = width / fontScale < 300 ? 2 : 3
    const style = styles(theme, columns)

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

    // There is flexbox complexity in centering rows with 3 tiles
    // while also left-justifying rows with 1 or 2 tiles so we just
    // make sure to fill the remaining space with invisible elements
    const renderBuffers = () => {
        const totalShortcuts = fediMods.length
        const bufferCount = (columns - (totalShortcuts % columns)) % columns

        return new Array(bufferCount).fill('').map((_, i) => {
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

            // This is smaller than the designs because
            // the tiles already have some padding
            rowGap: theme.spacing.md,
        },
    })

export default ShortcutsList
