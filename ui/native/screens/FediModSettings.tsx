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

import { selectCommunityModsById } from '@fedi/common/redux'
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
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage, { getIconSizeMultiplier } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'FediModSettings' | 'FederationModSettings'
>

// Helper function to calculate reusable style variables
const getDynamicSizes = (theme: Theme, fontScale: number) => {
    const iconSize = theme.sizes.sm * getIconSizeMultiplier(fontScale)
    return { iconSize }
}

const FediModSettingsScreen: React.FC<Props> = ({ route }: Props) => {
    const { theme } = useTheme()
    const { fontScale } = useWindowDimensions()
    const { t } = useTranslation()
    const navigation = useNavigation()

    const dispatch = useAppDispatch()
    const { type, federationId } = route.params

    const selectConfigMods = useAppSelector(selectConfigurableMods)
    const federationMods = useAppSelector(state =>
        federationId ? selectCommunityModsById(state, federationId) : [],
    )

    // Select the correct data based on the type
    const mods = type === 'fedi' ? selectConfigMods : federationMods

    const modsVisibility = useAppSelector(selectModsVisibility)

    const [deletingMod, setDeletingMod] = useState<FediMod>()
    const [isDeleting, setIsDeleting] = useState<boolean>(false)

    const { iconSize } = getDynamicSizes(theme, fontScale)

    useEffect(() => {
        if (!deletingMod) {
            setIsDeleting(false)
        }
    }, [deletingMod])

    const style = styles(theme, fontScale, iconSize)

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
                    federationId: federationId,
                }),
            )
        },
        [modsVisibility, dispatch, type, federationId],
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
            const visibility = modsVisibility[mod.id]
            let isHidden = false

            if (type === 'fedi') {
                isHidden = !!visibility?.isHidden
            } else {
                // Only consider the mod hidden in this federation if federationId matches
                isHidden = !!(
                    visibility?.isHiddenCommunity &&
                    visibility?.federationId === federationId
                )
            }

            const canDelete = visibility?.isCustom

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
    }, [mods, modsVisibility, handleToggleVisibility, type, federationId])

    return (
        <SafeAreaContainer style={style.container} edges="notop">
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
                ) : type === 'fedi' ? ( // Show add mod UI only for 'fedi' type
                    <View style={style.empty}>
                        <Pressable
                            onPress={() => navigation.navigate('AddFediMod')}>
                            <SvgImage name="NewModIcon" size={48} />
                        </Pressable>
                        <Text>{t('feature.fedimods.add-mods-homescreen')}</Text>
                    </View>
                ) : (
                    <View style={style.centeredContainer}>
                        <View style={style.centeredEmpty}>
                            <View
                                style={{
                                    marginBottom: theme.spacing.md,
                                }}>
                                <SvgImage
                                    color="grey"
                                    name="Error"
                                    size={iconSize}
                                />
                            </View>
                            <Text style={style.centeredText}>
                                {t('feature.fedimods.no-mods-available')}
                            </Text>
                        </View>
                    </View>
                )}
            </ScrollView>
            {type === 'fedi' &&
                mods.length > 0 && ( // Only show the button for 'fedi' type and when mods are present
                    <Button onPress={() => navigation.navigate('AddFediMod')}>
                        {t('feature.fedimods.add-a-mini-app')}
                    </Button>
                )}
        </SafeAreaContainer>
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
    const [loaded, setLoaded] = useState(false)
    // use local image if we have it
    // then try image url
    // fallback to default
    const [imageSrc, setImageSrc] = useState(
        FediModImages[mod.id] ||
            (mod.imageUrl ? { uri: mod.imageUrl } : FediModImages.default),
    )
    const { iconSize } = getDynamicSizes(theme, fontScale)
    const style = styles(theme, fontScale, iconSize)

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
            <Pressable
                testID={mod.title
                    .concat('VisibilityToggleButton')
                    .replaceAll(' ', '')}
                onPress={() => onToggleVisibility(mod)}>
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

const styles = (theme: Theme, fontScale: number, iconSize: number) => {
    const textSize = theme.sizes.xs * fontScale

    return StyleSheet.create({
        scrollContainer: {
            flex: 1,
        },
        contentContainer: {
            flexGrow: 1,
            gap: theme.spacing.lg,
        },
        container: {
            gap: theme.spacing.md,
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
        centeredEmpty: {
            justifyContent: 'center',
            alignItems: 'center',
            padding: theme.spacing.xl,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.colors.grey,
            borderRadius: 8,
            paddingVertical: theme.spacing.xl,
        },
        centeredText: {
            textAlign: 'center',
            color: theme.colors.grey,
            fontSize: textSize,
        },
        iconStyle: {
            marginBottom: theme.spacing.sm,
        },
        centeredContainer: {
            flex: 1,
            alignContent: 'center',
            alignItems: 'center',
            justifyContent: 'center',
        },
    })
}

export default FediModSettingsScreen
