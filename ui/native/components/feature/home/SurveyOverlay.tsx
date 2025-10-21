import { useNavigation } from '@react-navigation/native'
import { Text, Button, useTheme } from '@rneui/themed'

import { useSurveyForm } from '@fedi/common/hooks/survey'

import CenterOverlay from '../../ui/CenterOverlay'
import Flex from '../../ui/Flex'
import HoloCircle from '../../ui/HoloCircle'
import SvgImage from '../../ui/SvgImage'

const SurveyOverlay = () => {
    const navigation = useNavigation()

    const { theme } = useTheme()
    const { show, handleDismiss, handleAccept, activeSurvey } = useSurveyForm()

    const handleNavigate = (url: URL) => {
        // wait for the modal's close animation + unmount to finish
        // immediately navigating while the modal is actively unmounting causes the screen to be unresponsive
        setTimeout(() => {
            navigation.navigate('FediModBrowser', {
                url: url.toString(),
            })
        }, 500)
    }

    if (!activeSurvey) return null

    return (
        <CenterOverlay
            show={show}
            onBackdropPress={handleDismiss}
            showCloseButton>
            <Flex gap="lg" align="center" fullWidth>
                <HoloCircle
                    size={64}
                    content={<SvgImage name="Tooltip" size={48} />}
                />
                <Text h2 medium center>
                    {activeSurvey.title}
                </Text>
                <Text center color={theme.colors.darkGrey}>
                    {activeSurvey.description}
                </Text>
                <Button onPress={() => handleAccept(handleNavigate)} fullWidth>
                    {activeSurvey.buttonText}
                </Button>
            </Flex>
        </CenterOverlay>
    )
}

export default SurveyOverlay
