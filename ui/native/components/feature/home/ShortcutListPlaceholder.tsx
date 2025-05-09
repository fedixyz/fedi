import { useNavigation } from '@react-navigation/native'
import { Theme, useTheme, Text } from '@rneui/themed'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { useSelector } from 'react-redux'

import { selectCoreMods } from '@fedi/common/redux/mod'

import { FediModImages } from '../../../assets/images'
import { FediMod, Shortcut, ShortcutType } from '../../../types'
import ShortcutTile from './ShortcutTile'

const MOD_ORDER = ['catalog', 'lngpt', 'swap'] as const
const columns = 3

const isFediMod = (s: Shortcut): s is FediMod => 'url' in s

const ShortcutsListPlaceholder: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation()

    // Fetch core mods from redux
    const coreMods = useSelector(selectCoreMods) as FediMod[] | undefined

    const shortcuts = useMemo<Shortcut[]>(() => {
        if (!coreMods?.length) return []
        const sorted = [...coreMods].sort((a, b) => {
            const idxA = MOD_ORDER.indexOf(a.id as (typeof MOD_ORDER)[number])
            const idxB = MOD_ORDER.indexOf(b.id as (typeof MOD_ORDER)[number])
            if (idxA === -1 && idxB === -1) return 0
            if (idxA === -1) return 1
            if (idxB === -1) return -1
            return idxA - idxB
        })
        return sorted.map(m => ({
            id: m.id,
            title: m.title,
            type: ShortcutType.fediMod,
            url: m.url,
            icon: {
                image: FediModImages[m.id] ?? { uri: m.imageUrl },
            },
        }))
    }, [coreMods])

    if (!shortcuts.length) return null

    const handleSelect = (shortcut: Shortcut) => {
        if (isFediMod(shortcut)) {
            navigation.navigate('FediModBrowser', { url: shortcut.url })
        }
    }

    const handleHold = undefined

    return (
        <View style={styles(theme).container}>
            <Text style={styles(theme).sectionTitle}>
                {t('feature.home.federation-mods-title')}
            </Text>
            <Text style={styles(theme).servicesSelected}>
                {t('feature.home.federation-services-selected')}
            </Text>

            <View style={styles(theme).listContainer}>
                {shortcuts.map(s => (
                    <View key={s.title} style={styles(theme).shortcut}>
                        <ShortcutTile
                            shortcut={s}
                            onSelect={handleSelect}
                            onHold={handleHold}
                        />
                    </View>
                ))}
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: { flex: 1, width: '100%' },
        sectionTitle: {
            color: theme.colors.night,
            letterSpacing: -0.16,
            fontSize: 20,
            marginBottom: 4,
        },
        servicesSelected: {
            fontFamily: 'Albert Sans',
            fontWeight: '400',
            fontSize: 14,
            lineHeight: 18,
            color: theme.colors.darkGrey,
            letterSpacing: -0.14,
            marginBottom: 12,
        },
        listContainer: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            rowGap: theme.spacing.md,
        },
        shortcut: {
            width: `${100 / columns}%`,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xs,
        },
    })

export default ShortcutsListPlaceholder
