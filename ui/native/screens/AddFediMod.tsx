import { useHeaderHeight } from '@react-navigation/elements'
import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Image, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SvgUri } from 'react-native-svg'
import { useDispatch } from 'react-redux'

import useValidateMiniAppUrl from '@fedi/common/hooks/miniapps'
import { addCustomMod } from '@fedi/common/redux/mod'
import { makeLog } from '@fedi/common/utils/log'
import { stripAndDeduplicateWhitespace } from '@fedi/common/utils/strings'

import { FediModImages } from '../assets/images'
import {
    OmniInput,
    OmniInputAction,
} from '../components/feature/omni/OmniInput'
import { Row, Column } from '../components/ui/Flex'
import { PressableIcon } from '../components/ui/PressableIcon'
import { SafeScrollArea } from '../components/ui/SafeArea'
import { ParserDataType } from '../types'
import { RootStackParamList } from '../types/navigation'
import { useImeFooterLift } from '../utils/hooks/keyboard'

const log = makeLog('AddFediMod')

export type Props = NativeStackScreenProps<RootStackParamList, 'AddFediMod'>

const AddFediMod: React.FC<Props> = ({ route }: Props) => {
    const { inputMethod = 'enter' } = route.params || {}

    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useDispatch()
    const navigation = useNavigation()

    const {
        url,
        setUrl,
        title,
        setTitle,
        imageUrl,
        setImageUrl,
        isFetching,
        canSave,
    } = useValidateMiniAppUrl()

    const style = styles(theme)
    const scrollRef = useRef<ScrollView>(null)
    const titleInputRef = useRef<TextInput>(null)

    const insets = useSafeAreaInsets()
    const headerHeight = useHeaderHeight()

    const iosOffset = Math.max(0, headerHeight - insets.top + theme.spacing.xl)
    const extraPadAndroid35 = useImeFooterLift()

    const handleSubmit = async () => {
        try {
            const validUrl = new URL(
                /^https?:\/\//i.test(url) ? url : `https://${url}`,
            ).toString()

            const modTitle = stripAndDeduplicateWhitespace(title)

            dispatch(
                addCustomMod({
                    fediMod: {
                        id: `custom-${Date.now()}`,
                        title: modTitle,
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

    const handleClearTitle = () => {
        setTitle('')
        titleInputRef.current?.focus()
    }

    const setInputMethod = useCallback(
        (targetInputMethod: 'enter' | 'scan') => {
            navigation.navigate('AddFediMod', {
                inputMethod: targetInputMethod,
            })
        },
        [navigation],
    )

    const customActions: OmniInputAction[] = useMemo(() => {
        return [
            {
                label: t('feature.omni.action-enter-url'),
                icon: 'Globe',
                onPress: () => setInputMethod('enter'),
            },
        ]
    }, [t, setInputMethod])

    if (inputMethod === 'scan') {
        return (
            <>
                <OmniInput
                    expectedInputTypes={[ParserDataType.Website]}
                    onExpectedInput={parsedData => {
                        if (parsedData.type === ParserDataType.Website) {
                            setUrl(parsedData.data.url)
                            setInputMethod('enter')
                        }
                    }}
                    onUnexpectedSuccess={() => null}
                    customActions={customActions}
                />
            </>
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
                    <Column grow gap="xs">
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
                                <Row align="center" justify="between">
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
                                </Row>
                            }
                            inputContainerStyle={style.innerInputContainer}
                            containerStyle={style.inputContainer}
                            disabled={isFetching}
                            returnKeyType="done"
                            ref={(ref: TextInput | null) => {
                                titleInputRef.current = ref
                            }}
                            rightIcon={
                                title.length > 0 && (
                                    <PressableIcon
                                        onPress={handleClearTitle}
                                        svgName="Close"
                                        svgProps={{ size: 20 }}
                                    />
                                )
                            }
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
                                                ? {
                                                      uri: imageUrl,
                                                      cache: 'force-cache',
                                                  }
                                                : FediModImages.default
                                        }
                                        style={style.previewIcon}
                                    />
                                )
                            }
                            disabled={isFetching}
                            returnKeyType="done"
                        />
                    </Column>
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
        headerIcon: {
            alignItems: 'center',
            display: 'flex',
            height: theme.sizes.md,
            justifyContent: 'center',
            width: theme.sizes.md,
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
