import { useNavigation } from '@react-navigation/native'
import { Theme, useTheme, Text } from '@rneui/themed'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { useDispatch, useSelector } from 'react-redux'

import { openMiniAppSession } from '@fedi/common/redux'
import { selectCoreMods } from '@fedi/common/redux/mod'

import { FediModImages } from '../../../assets/images'
import { FediMod, ShortcutType } from '../../../types'
import Flex from '../../ui/Flex'
import ShortcutTile from './ShortcutTile'

const MOD_ORDER = ['catalog', 'lngpt', 'swap'] as const
const columns = 3

const ShortcutsListPlaceholder: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useDispatch()
    const navigation = useNavigation()

    const coreMods = useSelector(selectCoreMods) as FediMod[] | undefined

    const shortcuts = useMemo<FediMod[]>(() => {
        if (!coreMods?.length) return []
        // sort by MOD_ORDER
        const sorted = [...coreMods].sort((a, b) => {
            const idxA = MOD_ORDER.indexOf(a.id as (typeof MOD_ORDER)[number])
            const idxB = MOD_ORDER.indexOf(b.id as (typeof MOD_ORDER)[number])
            if (idxA === -1 && idxB === -1) return 0
            if (idxA === -1) return 1
            if (idxB === -1) return -1
            return idxA - idxB
        })

        return sorted.map(
            m =>
                new FediMod({
                    id: m.id,
                    title: m.title,
                    type: ShortcutType.fediMod,
                    url: m.url,
                    icon: { image: FediModImages[m.id] ?? { uri: m.imageUrl } },
                }),
        )
    }, [coreMods])

    if (!shortcuts.length) {
        return null
    }

    const handleSelect = (mod: FediMod) => {
        dispatch(openMiniAppSession({ miniAppId: mod.id, url: mod.url }))
        navigation.navigate('FediModBrowser')
    }

    const handleHold: ((mod: FediMod) => void) | undefined = undefined

    const style = styles(theme)

    return (
        <Flex grow fullWidth>
            <Text style={style.sectionTitle}>
                {t('feature.home.federation-mods-title')}
            </Text>
            <Text style={style.servicesSelected}>
                {t('feature.home.federation-services-selected')}
            </Text>

            <Flex
                row
                justify="between"
                wrap
                style={{ rowGap: theme.spacing.md }}>
                {shortcuts.map(s => (
                    <View key={s.id} style={style.shortcut}>
                        <ShortcutTile
                            shortcut={s}
                            onSelect={handleSelect}
                            onHold={handleHold}
                        />
                    </View>
                ))}
            </Flex>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
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
        shortcut: {
            width: `${100 / columns}%`,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xs,
        },
    })

export default ShortcutsListPlaceholder
