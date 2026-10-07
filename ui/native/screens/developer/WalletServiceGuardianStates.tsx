import { Switch, Text } from '@rneui/themed'

import {
    selectCanSimulateGuardianHealth,
    selectGuardianHealthSimulation,
    setGuardianHealthSimulation,
} from '@fedi/common/redux'
import type { LoadedFederation } from '@fedi/common/types'
import type { GuardianStatus } from '@fedi/common/types/bindings'
import {
    guardianQuorum,
    readGuardianStatus,
} from '@fedi/common/utils/federationHealth'

import { Column, Row } from '../../components/ui/Flex'
import { useAppDispatch, useAppSelector } from '../../state/hooks'
import { simulatedGuardian } from './simulatedGuardian'

const FMAN_NAMES = [
    'mutual-hamster',
    'quiet-lynx',
    'calm-marmot',
    'bright-kestrel',
    'relieved-titmouse',
    'gentle-heron',
    'brave-otter',
    'steady-falcon',
    'lucky-badger',
    'patient-walrus',
]

type GuardianState = 'all-online' | 'one-not-responding' | 'offline' | 'unnamed'

const STATES: [GuardianState, string][] = [
    ['all-online', 'All online'],
    ['one-not-responding', 'One not responding'],
    ['offline', 'Offline'],
    ['unnamed', 'Names missing'],
]

const respondingCount = (state: GuardianState, total: number) => {
    if (state === 'one-not-responding') return total - 1
    if (state === 'offline') return guardianQuorum(total) - 1
    return total
}

const buildGuardians = (
    state: GuardianState,
    urls: string[],
): GuardianStatus[] => {
    const responding = respondingCount(state, urls.length)
    return urls.map((guardian, index) =>
        simulatedGuardian(
            guardian,
            index >= urls.length - responding,
            state === 'unnamed'
                ? null
                : (FMAN_NAMES[index] ?? `guardian-${index + 1}`),
        ),
    )
}

const activeState = (guardians: GuardianStatus[]): GuardianState => {
    const read = guardians.map(readGuardianStatus)
    const responding = read.filter(g => g.isResponding).length
    if (read.every(g => g.fman_name === null)) return 'unnamed'
    if (responding === guardians.length) return 'all-online'
    if (responding === guardians.length - 1) return 'one-not-responding'
    return 'offline'
}

const WalletServiceGuardianStates = ({
    federation,
}: {
    federation: LoadedFederation
}) => {
    const dispatch = useAppDispatch()
    const available = useAppSelector(selectCanSimulateGuardianHealth)
    const simulation = useAppSelector(s =>
        selectGuardianHealthSimulation(s, federation.id),
    )
    const checked = useAppSelector(
        s => s.federation.guardianHealth[federation.id]?.guardians,
    )
    if (!available) return null

    const nodeUrls = Object.values(federation.nodes).map(node => node.url)
    const urls = nodeUrls.length
        ? nodeUrls
        : (checked ?? []).map(status => readGuardianStatus(status).guardian)
    const active = simulation ? activeState(simulation.guardians) : null
    const select = (state: GuardianState, enabled: boolean) => {
        dispatch(
            setGuardianHealthSimulation({
                federationId: federation.id,
                simulation: enabled
                    ? {
                          guardians: buildGuardians(state, urls),
                          mode: 'sustained',
                      }
                    : undefined,
            }),
        )
    }

    return (
        <Column gap="md">
            <Column gap="xs">
                <Text caption>Wallet service guardian states</Text>
                <Text small>
                    Forces the guardian list on the wallet service dashboard.
                    Turning one on turns the others off. Turn it off to see the
                    real connection.
                </Text>
            </Column>
            {STATES.map(([state, title]) => (
                <Row key={state} align="center" justify="between" gap="md">
                    <Text caption>{title}</Text>
                    <Switch
                        accessibilityLabel={title}
                        disabled={urls.length === 0}
                        value={active === state}
                        onValueChange={enabled => select(state, enabled)}
                    />
                </Row>
            ))}
        </Column>
    )
}

export default WalletServiceGuardianStates
