import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { Trans, useTranslation } from 'react-i18next'
import { Linking, Pressable, StyleSheet } from 'react-native'

import CheckList from '../components/ui/CheckList'
import Flex from '../components/ui/Flex'
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
            <Flex grow style={style.content}>
                <Flex align="center" gap="xl" style={style.header}>
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
                </Flex>
                <CheckList
                    items={[
                        'feature.multispend.intro-1',
                        'feature.multispend.intro-2',
                        'feature.multispend.intro-3',
                        'feature.multispend.intro-4',
                        'feature.multispend.intro-5',
                    ]}
                />
                <Flex center>
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
                </Flex>
            </Flex>
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
            paddingHorizontal: theme.spacing.md,
        },
        header: {
            paddingVertical: theme.spacing.xl,
        },
        headerText: { textAlign: 'center' },
        learnMoreButton: {
            padding: theme.spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
    })

export default MultispendIntro
