import { useRecoveryProgress } from '@fedi/common/hooks/recovery'

import { fedimint } from '../lib/bridge'
import { styled, theme } from '../styles'
import { HoloLoader } from './HoloLoader'
import { Text } from './Text'

type Props = {
    label?: string
    federationId: string
}

export const RecoveryInProgress: React.FC<Props> = ({
    label,
    federationId,
}) => {
    const { progress } = useRecoveryProgress(fedimint, federationId)

    return (
        <Container aria-label="recovery-in-progress">
            <HoloLoader
                size="xl"
                label={progress ? `${Math.floor(progress * 100)}%` : undefined}
            />
            <Label variant="caption">{label}</Label>
        </Container>
    )
}

const Container = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 40,
    textAlign: 'center',
    width: '100%',
})

const Label = styled(Text, {
    color: theme.colors.black,
})
