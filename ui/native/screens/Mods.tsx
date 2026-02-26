import { useNavigation } from '@react-navigation/native'
import { useTheme, type Theme } from '@rneui/themed'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Image,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
} from 'react-native'

import { openMiniAppSession } from '@fedi/common/redux'
import {
    removeCustomMod,
    selectAllVisibleMods,
    selectMiniAppOrder,
    setMiniAppOrder,
    setModVisibility,
    updateLastSeenModDate,
} from '@fedi/common/redux/mod'
import { isFediDeeplinkType } from '@fedi/common/utils/linking'

import ModsHeader from '../components/feature/fedimods/ModsHeader'
import SortableMiniAppsGrid from '../components/feature/fedimods/SortableMiniAppsGrid'
import CustomOverlay, {
    CustomOverlayContents,
} from '../components/ui/CustomOverlay'
import { Column } from '../components/ui/Flex'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { FediMod, Shortcut } from '../types'
import { NavigationHook } from '../types/navigation'
import { useLaunchZendesk } from '../utils/hooks/support'
import { handleFediModNavigation, openURL } from '../utils/linking'

const Mods: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const dispatch = useAppDispatch()
    const mods = useAppSelector(selectAllVisibleMods)
    const miniAppOrder = useAppSelector(selectMiniAppOrder)
    const { width, fontScale } = useWindowDimensions()
    const columns = width / fontScale < 300 ? 2 : 3
    const style = styles(theme, columns)

    const { launchZendesk } = useLaunchZendesk()

    const [modToBeRemoved, setModToBeRemoved] = useState<FediMod>()
    const [isRemovingMod, setIsRemovingMod] = useState<boolean>(false)

    const onSelectFediMod = async (shortcut: Shortcut) => {
        const fediMod = shortcut as FediMod

        dispatch(
            updateLastSeenModDate({
                modId: fediMod.id,
            }),
        )

        if (fediMod.title.toLowerCase().includes('ask fedi')) {
            launchZendesk()
            return
        }

        if (isFediDeeplinkType(fediMod.url)) {
            openURL(fediMod.url)
        } else {
            dispatch(
                openMiniAppSession({
                    miniAppId: fediMod.id,
                    url: fediMod.url,
                }),
            )
            await handleFediModNavigation(fediMod, navigation)
        }
    }

    const hideMod = (mod: FediMod) => {
        dispatch(setModVisibility({ modId: mod.id, isHidden: true }))
    }

    const handleRemovePress = (fediMod: FediMod) => {
        setModToBeRemoved(fediMod)
    }

    const sortedMiniApps = [...mods]
        .sort((a, b) => {
            const aIndex = miniAppOrder.indexOf(a.id)
            const bIndex = miniAppOrder.indexOf(b.id)

            // use place in order if present
            if (aIndex >= 0 && bIndex >= 0) {
                return aIndex - bIndex
            } else if (aIndex >= 0) {
                return -1
            } else if (bIndex >= 0) {
                return 1
            }

            return 0
        })
        .map(miniApp => {
            return new FediMod(miniApp)
        })

    useEffect(() => {
        if (miniAppOrder.length === 0) {
            const orderedMiniApps = sortedMiniApps.map(miniApp => miniApp.id)
            dispatch(
                setMiniAppOrder({
                    miniAppOrder: orderedMiniApps,
                }),
            )
        }
    }, [sortedMiniApps, miniAppOrder, dispatch])

    const confirmModRemoval: CustomOverlayContents = useMemo(() => {
        const confirmModDeletion = async () => {
            if (modToBeRemoved === undefined) {
                return
            }

            setIsRemovingMod(true)
            await dispatch(removeCustomMod({ modId: modToBeRemoved.id }))
            setModToBeRemoved(undefined)
            setIsRemovingMod(false)
        }

        return {
            headerElement: (
                <Column style={style.modRemovalOverlay}>
                    <Image style={style.modRemovalOverlayBgImage} />
                    <SvgImage
                        name="AlertWarningTriangle"
                        size={64}
                        color={theme.colors.orange}
                        containerStyle={style.modRemovalOverlayIcon}
                    />
                </Column>
            ),
            title: t('feature.fedimods.delete-confirmation', {
                miniAppName: modToBeRemoved?.title,
            }),
            buttons: [
                {
                    text: t('words.cancel'),
                    onPress: () => setModToBeRemoved(undefined),
                    primary: false,
                },
                {
                    text: t('words.remove'),
                    onPress: confirmModDeletion,
                    primary: true,
                },
            ],
        }
    }, [t, modToBeRemoved, dispatch, style, theme])

    const handleRearrangeMiniApps = (newOrder: FediMod['id'][]) => {
        dispatch(
            setMiniAppOrder({
                miniAppOrder: [...newOrder],
            }),
        )
    }

    return (
        <Column grow>
            <ModsHeader />
            {sortedMiniApps.length > 0 ? (
                <SortableMiniAppsGrid
                    key={sortedMiniApps.length}
                    miniApps={sortedMiniApps}
                    onHide={hideMod}
                    onRearrange={handleRearrangeMiniApps}
                    onRemove={handleRemovePress}
                    onSelect={onSelectFediMod}
                />
            ) : (
                <Column center grow gap="md">
                    <Pressable
                        onPress={() =>
                            navigation.navigate('AddFediMod', {
                                inputMethod: 'enter',
                            })
                        }>
                        <SvgImage name="NewModIcon" size={48} />
                    </Pressable>
                    <Text>{t('feature.fedimods.add-mods-homescreen')}</Text>
                </Column>
            )}
            <CustomOverlay
                show={modToBeRemoved !== undefined}
                contents={confirmModRemoval}
                loading={isRemovingMod}
                onBackdropPress={() => setModToBeRemoved(undefined)}
            />
        </Column>
    )
}

const styles = (theme: Theme, columns: number) =>
    StyleSheet.create({
        shortcut: { width: `${100 / columns}%` },
        buffer: { height: theme.sizes.lg },
        listContainer: {
            flexGrow: 1,
            flexDirection: 'row',
            marginTop: theme.spacing.sm,
            paddingHorizontal: theme.spacing.sm,
        },
        modRemovalOverlay: {
            alignItems: 'center',
            justifyContent: 'center',
            height: 96,
            width: 96,
        },
        modRemovalOverlayBgImage: {
            backgroundColor: theme.colors.yellow,
            opacity: 0.4,
            width: 96,
            height: 96,
            borderRadius: 48,
            overflow: 'hidden',
            position: 'absolute',
        },
        modRemovalOverlayIcon: {
            position: 'relative',
            top: -4, // looks better when centering a triangle in a circle
        },
        rearrangeHeader: {
            padding: theme.spacing.lg,
        },
        rearrangeHeaderText: {
            color: theme.colors.darkGrey,
        },
        rearrangeFooterButton: {
            padding: theme.spacing.sm,
            zIndex: 1000,
        },
        tooltipAction: {
            flexDirection: 'row',
            alignItems: 'center',
            flexGrow: 1,
            padding: theme.spacing.sm,
        },
        tooltipPopover: {
            backgroundColor: theme.colors.darkGrey,
            padding: 0,
        },
        tooltipText: {
            color: theme.colors.white,
            flexGrow: 1,
        },
    })

export default Mods
