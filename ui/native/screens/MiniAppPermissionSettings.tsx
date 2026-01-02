import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Divider, Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Alert,
    Image,
    ImageSourcePropType,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native'

import {
    allowMiniAppPermissions,
    clearMiniAppPermissions,
    denyMiniAppPermissions,
    selectAllMiniAppPermissions,
    selectConfigurableMods,
} from '@fedi/common/redux/mod'
import {
    FediMod,
    MiniAppPermissionInfoLookup,
    MiniAppPermissionType,
    miniAppPermissionTypes,
} from '@fedi/common/types'

import { FediModImages } from '../assets/images'
import { Column, Row } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage, { SvgImageName, SvgImageSize } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'MiniAppPermissionSettings'
>

const MiniAppPermissionSettings: React.FC<Props> = () => {
    const { theme } = useTheme()
    const style = styles(theme)
    const { t } = useTranslation()

    const dispatch = useAppDispatch()

    const allMiniAppPermissions = useAppSelector(selectAllMiniAppPermissions)
    const configurableMiniApps = useAppSelector(selectConfigurableMods)

    const [expandedPermission, setExpandedPermission] = useState<
        MiniAppPermissionType | undefined
    >(undefined)

    const sortedPermissions = [...miniAppPermissionTypes].sort((a, b) => {
        const aDisplayName = t(
            MiniAppPermissionInfoLookup[a].displayNameTranslationKey,
        )
        const bDisplayName = t(
            MiniAppPermissionInfoLookup[b].displayNameTranslationKey,
        )

        return aDisplayName.localeCompare(bDisplayName)
    })

    const togglePermissionExpanded = (permission: MiniAppPermissionType) => {
        setExpandedPermission(prev =>
            prev === permission ? undefined : permission,
        )
    }

    const setAppPermission = (
        miniApp: FediMod,
        permission: MiniAppPermissionType,
        isAllowed: boolean,
    ) => {
        if (isAllowed) {
            dispatch(
                allowMiniAppPermissions({
                    miniAppUrl: miniApp.url,
                    permissions: [permission],
                }),
            )
        } else {
            dispatch(
                denyMiniAppPermissions({
                    miniAppUrl: miniApp.url,
                    permissions: [permission],
                }),
            )
        }
    }

    const clearAppPermission = (
        miniApp: FediMod,
        permission: MiniAppPermissionType,
    ) => {
        Alert.alert(
            t('words.confirm'),
            t('feature.fedimods.reset-permission-confirmation', {
                miniAppName: miniApp.title,
                permissionName: t(
                    MiniAppPermissionInfoLookup[permission]
                        .displayNameTranslationKey,
                ),
            }),
            [
                {
                    text: t('words.cancel'),
                    style: 'cancel',
                },
                {
                    text: t('words.reset'),
                    style: 'destructive',
                    onPress: () => {
                        dispatch(
                            clearMiniAppPermissions({
                                miniAppUrl: miniApp.url,
                                permissions: [permission],
                            }),
                        )
                    },
                },
            ],
        )
    }

    const permissionRows = sortedPermissions.map(permission => {
        const info = MiniAppPermissionInfoLookup[permission]
        const isExpanded = expandedPermission === permission

        const allowedApps = []
        const deniedApps = []

        for (const entry of Object.entries(allMiniAppPermissions)) {
            const [miniAppUrl, rememberedPermissions] = entry
            const isAllowed = rememberedPermissions[permission]
            const matchingMiniApp = configurableMiniApps.find(
                miniApp => miniApp.url === miniAppUrl,
            )

            if (matchingMiniApp !== undefined) {
                if (isAllowed === true) {
                    allowedApps.push(matchingMiniApp)
                } else if (isAllowed === false) {
                    deniedApps.push(matchingMiniApp)
                }
            }
        }

        const allowedAppElements = allowedApps.map(miniApp => {
            return (
                <MiniAppPermissionRow
                    key={`allowed_${miniApp.url}`}
                    miniApp={miniApp}
                    permission={permission}
                    isAllowed
                    onToggle={isEnabled =>
                        setAppPermission(miniApp, permission, isEnabled)
                    }
                    onReset={() => clearAppPermission(miniApp, permission)}
                />
            )
        })

        const deniedAppElements = deniedApps.map(miniApp => {
            return (
                <MiniAppPermissionRow
                    key={`denied_${miniApp.url}`}
                    miniApp={miniApp}
                    permission={permission}
                    isAllowed={false}
                    onToggle={isEnabled =>
                        setAppPermission(miniApp, permission, isEnabled)
                    }
                    onReset={() => clearAppPermission(miniApp, permission)}
                />
            )
        })

        const totalSize = allowedAppElements.length + deniedAppElements.length

        return (
            <Column key={permission}>
                <Row align="center" justify="between" style={{ padding: 4 }}>
                    <Row center gap={8}>
                        <SvgImage
                            name={info.iconName as SvgImageName}
                            size={SvgImageSize.sm}
                        />
                        <Column>
                            <Text bold>
                                {t(info.displayNameTranslationKey)}
                            </Text>
                            <Text>
                                {allowedAppElements.length} / {totalSize}{' '}
                                {t('phrases.mini-apps')} {t('words.allowed')}
                            </Text>
                        </Column>
                    </Row>

                    {totalSize > 0 && (
                        <View>
                            <Pressable
                                onPress={() =>
                                    togglePermissionExpanded(permission)
                                }>
                                <SvgImage
                                    name="ChevronDown"
                                    size={SvgImageSize.sm}
                                    containerStyle={{
                                        transform: [
                                            {
                                                rotateX: isExpanded
                                                    ? '180deg'
                                                    : '0deg',
                                            },
                                        ],
                                    }}
                                />
                            </Pressable>
                        </View>
                    )}
                </Row>

                {isExpanded && (
                    <Column>
                        {allowedAppElements}
                        {deniedAppElements}
                    </Column>
                )}
            </Column>
        )
    })

    const permissionElements: React.JSX.Element[] = permissionRows.reduce(
        (acc, permissionRow, index) => {
            if (acc.length === 0) {
                return [permissionRow]
            } else {
                return [
                    ...acc,
                    <Divider key={`divider_${index}`} />,
                    permissionRow,
                ]
            }
        },
        [] as React.JSX.Element[],
    )

    return (
        <SafeAreaContainer style={style.container} edges="notop">
            <ScrollView
                style={style.scrollContainer}
                contentContainerStyle={style.contentContainer}
                overScrollMode="auto">
                {permissionElements}
            </ScrollView>
        </SafeAreaContainer>
    )
}

type MiniAppPermissionRowProps = {
    isAllowed: boolean
    miniApp: FediMod
    permission: MiniAppPermissionType
    onToggle: (isEnabled: boolean) => void
    onReset: () => void
}

const MiniAppPermissionRow = (props: MiniAppPermissionRowProps) => {
    const { theme } = useTheme()
    const { isAllowed, miniApp, onToggle, onReset } = props

    const { t } = useTranslation()

    const [imageSrc, setImageSrc] = useState<ImageSourcePropType>(
        FediModImages[miniApp.id] ||
            (miniApp.imageUrl
                ? { uri: miniApp.imageUrl, cache: 'force-cache' }
                : FediModImages.default),
    )
    const style = styles(theme)

    return (
        <Row center justify="between" style={style.rowContainer}>
            <Row center gap={8} justify="start" grow shrink basis={false}>
                <Image
                    height={32}
                    width={32}
                    borderRadius={8}
                    source={imageSrc}
                    resizeMode="contain"
                    onError={() => setImageSrc(FediModImages.default)}
                />
                <Text bold>{miniApp.title}</Text>
            </Row>

            <Row center justify="end" gap={8} grow shrink basis={false}>
                <Text medium color={isAllowed ? 'green' : 'red'}>
                    {isAllowed ? t('words.allow') : t('words.deny')}
                </Text>

                <Switch
                    value={isAllowed}
                    onValueChange={isEnabled => onToggle(isEnabled)}
                />

                <Pressable
                    onPress={onReset}
                    hitSlop={12}
                    style={style.resetButton}>
                    <SvgImage name="Close" size={SvgImageSize.sm} />
                </Pressable>
            </Row>
        </Row>
    )
}

const styles = (theme: Theme) => {
    return StyleSheet.create({
        scrollContainer: {
            flex: 1,
            paddingVertical: theme.spacing.lg,
        },
        contentContainer: {
            flexGrow: 1,
            gap: theme.spacing.lg,
        },
        container: {
            gap: theme.spacing.md,
        },
        rowContainer: {
            padding: theme.spacing.md,
            backgroundColor: 'lightgrey',
        },
        actionsContainer: {
            flexBasis: 0,
            backgroundColor: 'lightblue',
        },
        resetButton: {
            paddingLeft: theme.spacing.md,
        },
    })
}

export default MiniAppPermissionSettings
