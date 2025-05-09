import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { Trans, useTranslation } from 'react-i18next'
import { Linking, Pressable, StyleSheet, View } from 'react-native'

import CheckList from '../components/ui/CheckList'
import HoloAlert from '../components/ui/HoloAlert'
import HoloCircle from '../components/ui/HoloCircle'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'MultispendIntro'
>

const MultispendIntro: React.FC<Props> = ({ navigation, route }) => {
    const { roomId } = route.params
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="notop" style={style.container}>
            <View style={style.content}>
                <View style={style.header}>
                    <HoloCircle
                        size={100}
                        content={<SvgImage name="Wallet" size={32} />}
                    />
                    <Text h2 medium style={style.headerText}>
                        <Trans
                            t={t}
                            i18nKey="feature.multispend.multispend-title"
                            components={{ bold: <Text h2 bold /> }}
                        />
                    </Text>
                </View>
                <CheckList
                    items={[
                        'feature.multispend.intro-1',
                        'feature.multispend.intro-2',
                        'feature.multispend.intro-3',
                        'feature.multispend.intro-4',
                        'feature.multispend.intro-5',
                    ]}
                />
                <View style={style.learnMoreContainer}>
                    <Pressable
                        onPress={() =>
                            Linking.openURL(
                                'https://support.fedi.xyz/hc/en-us/articles/20019791912466-What-is-Multispend',
                            )
                        }>
                        <HoloAlert containerStyle={style.learnMoreButton}>
                            <SvgImage name="Bulb" size={16} />
                            <Text tiny medium>
                                {t('feature.multispend.learn-more')}
                            </Text>
                        </HoloAlert>
                    </Pressable>
                </View>
            </View>
            <Button
                onPress={() =>
                    navigation.navigate('CreateMultispend', {
                        roomId,
                    })
                }>
                {t('feature.multispend.create-multispend')}
            </Button>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
        },
        content: {
            flex: 1,
            paddingHorizontal: theme.spacing.md,
        },
        header: {
            gap: theme.spacing.xl,
            paddingVertical: theme.spacing.xl,
            alignItems: 'center',
        },
        headerText: { textAlign: 'center' },
        learnMoreContainer: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        learnMoreButton: {
            padding: theme.spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
    })

export default MultispendIntro
