import { CheckBox, Text } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Pressable, StyleSheet, View } from 'react-native'

import { selectCurrentUrl } from '@fedi/common/redux'
import { selectMiniAppByUrl } from '@fedi/common/redux/mod'
import { MiniAppPermissionType } from '@fedi/common/types'

import { useAppSelector } from '../../state/hooks'
import { MiniAppPermissionInfoLookup } from '../../types'
import CustomOverlay, { CustomOverlayContents } from './CustomOverlay'
import { Column, Row } from './Flex'
import SvgImage from './SvgImage'

type RequestPermissionOverlayProps = {
    requestedPermission: MiniAppPermissionType | null
    handlePermissionResponse: (
        didAllow: boolean,
        shouldRemember: boolean,
    ) => void
    onAccept: (res: boolean) => void
    onReject: (err: Error) => void
}

const RequestPermissionOverlay = (props: RequestPermissionOverlayProps) => {
    const {
        requestedPermission,
        handlePermissionResponse,
        onAccept,
        onReject,
    } = props

    const { t } = useTranslation()
    const currentUrl = useAppSelector(selectCurrentUrl)
    const currentMiniApp = useAppSelector(s =>
        selectMiniAppByUrl(s, currentUrl ?? ''),
    )
    const [shouldRememberChoice, setShouldRememberChoice] =
        useState<boolean>(false)
    const permissionInfo = requestedPermission
        ? MiniAppPermissionInfoLookup[requestedPermission]
        : undefined

    const toggleShouldRemember = () => {
        setShouldRememberChoice(prev => {
            return !prev
        })
    }

    const handleAllow = () => {
        handlePermissionResponse(true, shouldRememberChoice)
        onAccept(true)
    }

    const handleDeny = () => {
        handlePermissionResponse(false, shouldRememberChoice)
        onReject(new Error(`Permission denied: ${requestedPermission}`))
    }

    if (!currentUrl || !permissionInfo) return null

    const title = currentMiniApp?.title || currentUrl
    const imageUrl = currentMiniApp?.imageUrl || ''

    const permissionConfirmationContent: CustomOverlayContents = {
        headerElement: imageUrl ? (
            <Image
                style={style.iconTile}
                source={{
                    uri: imageUrl,
                    cache: 'force-cache',
                }}
                resizeMode="contain"
            />
        ) : undefined,
        body: (
            <Column justify="start" gap={16}>
                <View>
                    <Text center>
                        {t('feature.fedimods.miniapp-requesting-permission', {
                            miniAppName: title,
                        })}
                    </Text>
                </View>

                <View>
                    <Text medium center>
                        {t(permissionInfo.descriptionTranslationKey)}
                    </Text>
                </View>

                <Pressable onPress={toggleShouldRemember}>
                    <Row center justify="center">
                        <CheckBox
                            checked={shouldRememberChoice}
                            pointerEvents="none"
                            title={t(
                                'feature.permissions.remember-permission-choice',
                            )}
                            containerStyle={{ padding: 0, margin: 0 }}
                            checkedIcon={
                                <SvgImage name="CheckboxChecked" size={32} />
                            }
                            uncheckedIcon={
                                <SvgImage name="CheckboxUnchecked" size={32} />
                            }
                        />
                    </Row>
                </Pressable>
            </Column>
        ),
        buttons: [
            {
                text: t('words.deny'),
                onPress: handleDeny,
                primary: false,
            },
            {
                text: t('words.allow'),
                onPress: handleAllow,
                primary: true,
            },
        ],
    }

    return (
        <CustomOverlay
            show={requestedPermission !== null}
            contents={permissionConfirmationContent}
        />
    )
}

const style = StyleSheet.create({
    iconTile: {
        width: 48,
        height: 48,
        overflow: 'hidden',
    },
})

export default RequestPermissionOverlay
