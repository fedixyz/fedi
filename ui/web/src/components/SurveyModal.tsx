import tooltipIcon from '@fedi/common/assets/svgs/tooltip.svg'
import { theme } from '@fedi/common/constants/theme'
import { useSurveyForm } from '@fedi/common/hooks/survey'

import { styled } from '../styles'
import { Icon } from './Icon'
import { Modal } from './Modal'

const SurveyModal = () => {
    const { show, handleDismiss, handleAccept, activeSurvey } = useSurveyForm()

    const handleOpen = (url: URL) => window.open(url.toString(), '_blank')

    if (!activeSurvey) return null

    return (
        <Modal
            open={show}
            onClick={() => handleAccept(handleOpen)}
            onOpenChange={handleDismiss}
            buttonText={activeSurvey.buttonText}
            title={activeSurvey.title}
            description={activeSurvey.description}
            showCloseButton>
            <ModalContents>
                <IconWrapper>
                    <Icon icon={tooltipIcon} size="md" />
                </IconWrapper>
                <h2>{activeSurvey.title}</h2>
                <Description>{activeSurvey.description}</Description>
            </ModalContents>
        </Modal>
    )
}

const ModalContents = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    position: 'relative',
})

const Description = styled('p', {
    textAlign: 'center',
    color: theme.colors.darkGrey,
})

const IconWrapper = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    width: 48,
    height: 48,
    fediGradient: 'sky',
})

export default SurveyModal
