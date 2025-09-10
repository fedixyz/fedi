import { useHeaderHeight } from '@react-navigation/elements'
import { useNavigation } from '@react-navigation/native'
import { Button, Image, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SvgUri } from 'react-native-svg'
import { useDispatch } from 'react-redux'

import { useDebouncedEffect } from '@fedi/common/hooks/util'
import { addCustomMod } from '@fedi/common/redux/mod'
import { tryFetchUrlMetadata } from '@fedi/common/utils/fedimods'
import { makeLog } from '@fedi/common/utils/log'
import { constructUrl } from '@fedi/common/utils/neverthrow'

import { FediModImages } from '../assets/images'
import {
    OmniInput,
    OmniInputAction,
} from '../components/feature/omni/OmniInput'
import Flex from '../components/ui/Flex'
import { SafeScrollArea } from '../components/ui/SafeArea'
import { ParserDataType } from '../types'
import { useImeFooterLift } from '../utils/hooks/keyboard'

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
    const scrollRef = useRef<ScrollView>(null)

    const insets = useSafeAreaInsets()
    const headerHeight = useHeaderHeight()

    const iosOffset = Math.max(0, headerHeight - insets.top + theme.spacing.xl)
    const extraPadAndroid35 = useImeFooterLift({
        insetsBottom: insets.bottom,
        buffer: theme.spacing.xxl,
    })

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
            if (url) {
                constructUrl(/^https?:\/\//.test(url) ? url : `https://${url}`)
                    // If URL construction fails, setIsValidUrl to false
                    .orTee(() => setIsValidUrl(false))
                    // Otherwise, set valid url and start fetching
                    .andTee(() => {
                        setIsValidUrl(true)
                        setIsFetching(true)
                    })
                    .asyncAndThen(tryFetchUrlMetadata)
                    .match(
                        metadata => {
                            setTitle(metadata.title)
                            setImageUrl(metadata.icon)
                            setIsFetching(false)
                        },
                        e => {
                            log.error('Failed to fetch fedi mod metadata', e)
                            setIsFetching(false)
                        },
                    )
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

    const content = (
        <>
            <SafeScrollArea
                ref={scrollRef}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentInsetAdjustmentBehavior="never"
                contentContainerStyle={{
                    flexGrow: 1,
                    paddingHorizontal: theme.spacing.xl,
                    paddingBottom: theme.spacing.xl,
                }}
                showsVerticalScrollIndicator={false}
                edges="top"
                safeAreaContainerStyle={{ paddingTop: 0 }}
                style={style.container}>
                <View style={style.inputWrapper}>
                    <Flex grow gap="xs">
                        <Input
                            value={url}
                            onChangeText={setUrl}
                            placeholder={t('words.url')}
                            label={<Text small>{t('words.URL')}</Text>}
                            inputContainerStyle={style.innerInputContainer}
                            containerStyle={style.inputContainer}
                            keyboardType="url"
                            autoCapitalize="none"
                            returnKeyType="done"
                        />
                        <Input
                            value={title}
                            onChangeText={setTitle}
                            placeholder={t('feature.fedimods.mod-title')}
                            numberOfLines={1}
                            label={
                                <Flex row align="center" justify="between">
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
                                                : title.length < 3 &&
                                                    title.length > 0
                                                  ? t('errors.title-too-short')
                                                  : ''}
                                        </Text>
                                    )}
                                </Flex>
                            }
                            inputContainerStyle={style.innerInputContainer}
                            containerStyle={style.inputContainer}
                            disabled={isFetching}
                            returnKeyType="done"
                        />
                        <Input
                            value={imageUrl}
                            onChangeText={setImageUrl}
                            label={<Text small>{t('words.icon')}</Text>}
                            inputContainerStyle={style.innerInputContainer}
                            containerStyle={style.inputContainer}
                            keyboardType="url"
                            rightIcon={
                                imageUrl?.endsWith('svg') ? (
                                    <SvgUri
                                        uri={imageUrl}
                                        width={32}
                                        height={32}
                                        fallback={
                                            <Image
                                                source={FediModImages.default}
                                                style={style.previewIcon}
                                            />
                                        }
                                        style={style.previewIcon}
                                    />
                                ) : (
                                    <Image
                                        source={
                                            imageUrl
                                                ? { uri: imageUrl }
                                                : FediModImages.default
                                        }
                                        style={style.previewIcon}
                                    />
                                )
                            }
                            disabled={isFetching}
                            returnKeyType="done"
                        />
                    </Flex>
                </View>
            </SafeScrollArea>
            <View
                style={[
                    style.buttonContainer,
                    {
                        paddingBottom: insets.bottom + theme.spacing.lg,
                        marginBottom: extraPadAndroid35,
                    },
                ]}>
                <Button
                    fullWidth
                    disabled={!canSave}
                    loading={isFetching}
                    onPress={handleSubmit}>
                    {t('words.save')}
                </Button>
            </View>
        </>
    )

    return (
        <>
            {Platform.OS === 'ios' ? (
                <KeyboardAvoidingView
                    behavior="padding"
                    style={style.container}
                    keyboardVerticalOffset={iosOffset}>
                    {content}
                </KeyboardAvoidingView>
            ) : (
                <View style={style.container}>{content}</View>
            )}
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
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
            marginBottom: theme.spacing.lg,
        },
        previewIcon: {
            width: 32,
            height: 32,
        },
        inputWrapper: {
            flex: 1,
        },
        buttonContainer: {
            paddingTop: theme.spacing.lg,
            paddingHorizontal: theme.spacing.lg,
            backgroundColor: theme.colors?.background,
            width: '100%',
        },
    })

export default AddFediMod
