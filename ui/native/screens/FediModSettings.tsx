import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import { selectActiveFederationFediMods } from '@fedi/common/redux'
import {
    removeCustomMod,
    selectConfigurableMods,
    selectModsVisibility,
    setModVisibility,
} from '@fedi/common/redux/mod'
import { FediMod } from '@fedi/common/types'

import { FediModImages } from '../assets/images'
import CustomOverlay, {
    CustomOverlayContents,
} from '../components/ui/CustomOverlay'
import SvgImage, { getIconSizeMultiplier } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'FediModSettings' | 'FederationModSettings'
>

const FediModSettingsScreen: React.FC<Props> = ({ route }: Props) => {
    const { theme } = useTheme()
    const { fontScale } = useWindowDimensions()
    const { t } = useTranslation()
    const insets = useSafeAreaInsets()
    const navigation = useNavigation()

    const dispatch = useAppDispatch()
    const { type } = route.params

    const selectConfigMods = useAppSelector(selectConfigurableMods)
    const selectActiveFedMods = useAppSelector(selectActiveFederationFediMods)

    // Select the correct data based on the type
    const mods = type === 'fedi' ? selectConfigMods : selectActiveFedMods

    const modsVisibility = useAppSelector(selectModsVisibility)

    const [deletingMod, setDeletingMod] = useState<FediMod>()
    const [isDeleting, setIsDeleting] = useState<boolean>(false)

    useEffect(() => {
        if (!deletingMod) {
            setIsDeleting(false)
        }
    }, [deletingMod])

    const style = styles(theme, fontScale, insets)

    const handleDeletePress = (mod: FediMod) => {
        setDeletingMod(mod)
    }

    const handleToggleVisibility = useCallback(
        (mod: FediMod) => {
            const visibilityKey =
                type === 'fedi' ? 'isHidden' : 'isHiddenCommunity'
            dispatch(
                setModVisibility({
                    modId: mod.id,
                    [visibilityKey]: !modsVisibility[mod.id]?.[visibilityKey],
                }),
            )
        },
        [modsVisibility, dispatch, type],
    )

    const confirmationContent: CustomOverlayContents = useMemo(() => {
        const confirmModDeletion = () => {
            if (!deletingMod) return

            setIsDeleting(true)
            dispatch(removeCustomMod({ modId: deletingMod.id }))
            setDeletingMod(undefined)
            setIsDeleting(false)
        }

        return {
            headerElement: (
                <Image
                    style={style.modTile}
                    source={{ uri: deletingMod?.imageUrl || '' }}
                    resizeMode="contain"
                />
            ),
            title: t('feature.fedimods.delete-confirmation', {
                fediMod: deletingMod?.title,
            }),
            buttons: [
                {
                    text: t('words.cancel'),
                    onPress: () => setDeletingMod(undefined),
                    primary: false,
                },
                {
                    text: t('words.delete'),
                    onPress: confirmModDeletion,
                    primary: true,
                },
            ],
        }
    }, [t, deletingMod, dispatch, style.modTile])

    const renderMods = useCallback(() => {
        return mods.map(mod => {
            const visibilityKey =
                type === 'fedi' ? 'isHidden' : 'isHiddenCommunity'
            const isHidden = modsVisibility[mod.id]?.[visibilityKey]
            const canDelete = modsVisibility[mod.id]?.isCustom

            return (
                <ModRow
                    key={mod.id}
                    isHidden={isHidden}
                    mod={mod}
                    onToggleVisibility={handleToggleVisibility}
                    onDelete={
                        type === 'fedi' && canDelete
                            ? handleDeletePress
                            : undefined
                    }
                />
            )
        })
    }, [mods, modsVisibility, handleToggleVisibility, type])

    return (
        <View style={style.container}>
            <ScrollView
                style={style.scrollContainer}
                contentContainerStyle={style.contentContainer}
                overScrollMode="auto">
                {mods.length > 0 ? (
                    <>
                        <Text style={style.label}>
                            {t('feature.fedimods.your-mods')}
                        </Text>
                        <View style={style.fediModsContainer}>
                            {renderMods()}
                        </View>

                        <CustomOverlay
                            show={!!deletingMod}
                            contents={confirmationContent}
                            loading={isDeleting}
                            onBackdropPress={() => setDeletingMod(undefined)}
                        />
                    </>
                ) : (
                    <View style={style.empty}>
                        <Pressable
                            onPress={() => navigation.navigate('AddFediMod')}>
                            <SvgImage name="NewModIcon" size={48} />
                        </Pressable>
                        <Text>{t('feature.fedimods.add-mods-homescreen')}</Text>
                    </View>
                )}
            </ScrollView>
            {type === 'fedi' && (
                <Button onPress={() => navigation.navigate('AddFediMod')}>
                    {t('feature.fedimods.add-a-mod')}
                </Button>
            )}
        </View>
    )
}

interface ModRowProps {
    isHidden: boolean
    mod: FediMod
    onDelete?: (mod: FediMod) => void
    onToggleVisibility: (mod: FediMod) => void
}

const ModRow: React.FC<ModRowProps> = ({
    isHidden,
    mod,
    onDelete,
    onToggleVisibility,
}) => {
    const { theme } = useTheme()
    const { fontScale } = useWindowDimensions()
    const insets = useSafeAreaInsets()

    const [imageSrc, setImageSrc] = useState(
        FediModImages[mod.id] ||
            (mod.imageUrl ? { uri: mod.imageUrl } : FediModImages.default),
    )

    const [loaded, setLoaded] = useState(false)

    const style = styles(theme, fontScale, insets)

    return (
        <View key={mod.id} style={style.fediMod}>
            <Image
                style={[style.iconImage, !loaded && style.loadingState]}
                source={imageSrc}
                resizeMode="contain"
                onError={() => setImageSrc(FediModImages.default)}
                onLoadEnd={() => setLoaded(true)}
            />
            <View style={style.fediModText}>
                <Text>{mod.title}</Text>
                <Text small>{mod.url}</Text>
            </View>
            <Pressable onPress={() => onToggleVisibility(mod)}>
                <SvgImage name={isHidden ? 'EyeClosed' : 'Eye'} size={24} />
            </Pressable>
            {onDelete && (
                <Pressable onPress={() => onDelete(mod)}>
                    <SvgImage name="Close" size={24} />
                </Pressable>
            )}
        </View>
    )
}

const styles = (theme: Theme, fontScale: number, insets: EdgeInsets) => {
    const iconSize = theme.sizes.lg * getIconSizeMultiplier(fontScale)

    return StyleSheet.create({
        scrollContainer: {
            flex: 1,
        },
        contentContainer: {
            flexGrow: 1,
            gap: theme.spacing.lg,
        },
        container: {
            flex: 1,
            flexDirection: 'column',
            gap: theme.spacing.md,
            paddingTop: theme.spacing.lg,
            paddingLeft: insets.left + theme.spacing.lg,
            paddingRight: insets.right + theme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
        },
        empty: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.md,
            alignItems: 'center',
            justifyContent: 'center',
        },
        fediModsContainer: {
            gap: theme.spacing.lg,
        },
        fediMod: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            justifyContent: 'space-between',
        },
        fediModText: {
            flex: 1,
        },
        iconImage: {
            width: 32,
            height: 32,
            overflow: 'hidden',
            borderRadius: 8,
        },
        loadingState: {
            opacity: 0,
            width: 1,
            height: 1,
        },
        label: {
            color: theme.colors.darkGrey,
        },
        modTile: {
            width: iconSize,
            height: iconSize,
            overflow: 'hidden',
            borderRadius: theme.borders.fediModTileRadius,
            marginBottom: theme.spacing.lg,
        },
    })
}

export default FediModSettingsScreen
