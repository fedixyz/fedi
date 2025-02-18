import { useNavigation } from '@react-navigation/native'
import { Button, Image, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { useDispatch } from 'react-redux'

import { useDebouncedEffect } from '@fedi/common/hooks/util'
import { addCustomMod } from '@fedi/common/redux/mod'
import { fetchMetadataFromUrl } from '@fedi/common/utils/fedimods'
import { makeLog } from '@fedi/common/utils/log'

import { FediModImages } from '../assets/images'
import {
    OmniInput,
    OmniInputAction,
} from '../components/feature/omni/OmniInput'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { ParserDataType } from '../types'

const log = makeLog('AddFediMod')

const AddFediMod: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const dispatch = useDispatch()
    const navigation = useNavigation()

    const [url, setUrl] = useState('')
    const [title, setTitle] = useState('')
    const [imageUrl, setImageUrl] = useState('')
    const [isFetching, setIsFetching] = useState(false)
    const [isValidUrl, setIsValidUrl] = useState(false)
    const [action, setAction] = useState<'scan' | 'enter'>('scan')

    const style = styles(theme)

    const handleSubmit = async () => {
        try {
            const validUrl = new URL(
                /^https?:\/\//.test(url) ? url : `https://${url}`,
            ).toString()

            dispatch(
                addCustomMod({
                    fediMod: {
                        id: `custom-${Date.now()}`,
                        title,
                        url: validUrl,
                        ...(imageUrl ? { imageUrl } : {}),
                    },
                }),
            )

            navigation.goBack() // multiple ways we could have been sent here
        } catch (e) {
            log.error('handleSubmit', e)
        }
    }

    const customActions: OmniInputAction[] = useMemo(() => {
        return [
            {
                label: t('feature.omni.action-enter-url'),
                icon: 'Globe',
                onPress: () => setAction('enter'),
            },
        ]
    }, [t])

    useDebouncedEffect(
        () => {
            const populateFieldsWithMetadata = async (validUrl: string) => {
                setIsFetching(true)
                const { fetchedTitle, fetchedIcon } =
                    await fetchMetadataFromUrl(validUrl)
                setTitle(fetchedTitle)
                setImageUrl(fetchedIcon)
                setIsFetching(false)
            }
            if (url) {
                try {
                    const validUrl = new URL(
                        /^https?:\/\//.test(url) ? url : `https://${url}`,
                    ).toString()

                    setIsValidUrl(true)
                    populateFieldsWithMetadata(validUrl)
                } catch {
                    setIsValidUrl(false)
                }
            }
        },
        [url],
        500,
    )

    const canSave =
        isValidUrl &&
        !isFetching &&
        title &&
        url &&
        title.length >= 3 &&
        title.length <= 24

    if (action === 'scan') {
        return (
            <OmniInput
                expectedInputTypes={[ParserDataType.Website]}
                onExpectedInput={parsedData => {
                    if (parsedData.type === ParserDataType.Website) {
                        setUrl(parsedData.data.url)
                        setAction('enter')
                    }
                }}
                onUnexpectedSuccess={() => null}
                customActions={customActions}
            />
        )
    }

    return (
        <SafeAreaContainer style={style.container} edges="notop">
            <View style={style.content}>
                <Input
                    value={url}
                    onChangeText={setUrl}
                    placeholder={t('words.url')}
                    label={<Text small>{t('words.URL')}</Text>}
                    inputContainerStyle={style.innerInputContainer}
                    containerStyle={style.inputContainer}
                    keyboardType="url"
                    autoCapitalize="none"
                />
                <Input
                    value={title}
                    onChangeText={setTitle}
                    placeholder={t('feature.fedimods.mod-title')}
                    label={
                        <View style={style.titleLabel}>
                            <Text small>{t('words.title')}</Text>
                            {title.length > 0 && (
                                <Text
                                    small
                                    style={{
                                        color:
                                            title.length < 3 ||
                                            title.length > 24
                                                ? theme.colors.red
                                                : theme.colors.primary,
                                    }}>
                                    {title.length > 24
                                        ? t('errors.title-too-long')
                                        : title.length < 3 && title.length > 0
                                          ? t('errors.title-too-short')
                                          : ''}
                                </Text>
                            )}
                        </View>
                    }
                    inputContainerStyle={[
                        style.innerInputContainer,
                        style.modTitle,
                    ]}
                    containerStyle={[
                        style.inputContainer,
                        style.modTitleContainer,
                    ]}
                    inputStyle={{ paddingTop: theme.spacing.sm }}
                    disabled={isFetching}
                    multiline
                />
                <Input
                    value={imageUrl}
                    onChangeText={setImageUrl}
                    label={<Text small>{t('words.icon')}</Text>}
                    inputContainerStyle={style.innerInputContainer}
                    containerStyle={style.inputContainer}
                    keyboardType="url"
                    rightIcon={
                        <Image
                            source={
                                imageUrl
                                    ? { uri: imageUrl }
                                    : FediModImages.default
                            }
                            style={style.previewIcon}
                        />
                    }
                    disabled={isFetching}
                />
            </View>
            <Button
                disabled={!canSave}
                loading={isFetching}
                onPress={handleSubmit}>
                {t('words.save')}
            </Button>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        titleLabel: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        modTitle: {
            alignItems: 'flex-start',
        },
        modTitleContainer: {
            display: 'flex',
        },
        omniContainer: {
            width: '100%',
            flex: 1,
        },
        content: {
            flexGrow: 1,
            gap: theme.spacing.lg,
        },
        container: {
            gap: theme.spacing.xs,
        },
        innerInputContainer: {
            marginTop: theme.spacing.xs,
            paddingLeft: theme.spacing.md,
            paddingRight: theme.spacing.xs,
            borderColor: theme.colors.primaryVeryLight,
            borderWidth: 1.5,
            borderRadius: 12,
        },
        inputContainer: {
            paddingHorizontal: 0,
        },
        previewIcon: {
            width: 32,
            height: 32,
        },
    })

export default AddFediMod
