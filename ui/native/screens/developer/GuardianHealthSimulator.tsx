import { Button, Switch, Text } from '@rneui/themed'

import {
    selectCanSimulateGuardianHealth,
    selectGuardianHealthSimulation,
    setGuardianHealthSimulation,
} from '@fedi/common/redux'
import type { GuardianHealthSimulation } from '@fedi/common/redux/federation'
import type { LoadedFederation } from '@fedi/common/types'
import type { GuardianStatus } from '@fedi/common/types/bindings'

import { Column, Row } from '../../components/ui/Flex'
import { useAppDispatch, useAppSelector } from '../../state/hooks'
import { simulatedGuardian } from './simulatedGuardian'

const GuardianHealthSimulator = ({
    federation,
}: {
    federation: LoadedFederation
}) => {
    const dispatch = useAppDispatch()
    const available = useAppSelector(selectCanSimulateGuardianHealth)
    const simulation = useAppSelector(s =>
        selectGuardianHealthSimulation(s, federation.id),
    )
    if (!available) return null

    const nodes = Object.values(federation.nodes)
    const guardians: GuardianStatus[] =
        simulation?.guardians ??
        nodes.map(node => simulatedGuardian(node.url, true))
    const update = (next: GuardianHealthSimulation | undefined) => {
        dispatch(
            setGuardianHealthSimulation({
                federationId: federation.id,
                simulation: next,
            }),
        )
    }

    const setGuardianOnline = (index: number, online: boolean) => {
        const next = [...guardians]
        next[index] = simulatedGuardian(nodes[index].url, online)
        update({ guardians: next, mode: simulation?.mode ?? 'sustained' })
    }

    return (
        <Column gap="md">
            <Row align="center" justify="between" gap="md">
                <Column shrink gap="xs">
                    <Text caption>Simulate guardian connections</Text>
                    <Text small>
                        Changes indicators for {federation.name}. Payments use
                        the real connection. Restart the app to clear the
                        simulation.
                    </Text>
                </Column>
                <Switch
                    accessibilityLabel="Simulate guardian connections"
                    disabled={nodes.length === 0}
                    value={!!simulation}
                    onValueChange={enabled =>
                        update(
                            enabled
                                ? { guardians, mode: 'sustained' }
                                : undefined,
                        )
                    }
                />
            </Row>
            {simulation && (
                <>
                    <Row wrap gap="sm">
                        {(
                            [
                                ['recent', 'Just changed'],
                                ['sustained', 'Ongoing'],
                                ['unknown', 'No result'],
                            ] as const
                        ).map(([mode, title]) => (
                            <Button
                                key={mode}
                                title={title}
                                type={
                                    simulation.mode === mode
                                        ? 'solid'
                                        : 'outline'
                                }
                                onPress={() => update({ guardians, mode })}
                            />
                        ))}
                    </Row>
                    <Text small>
                        Ongoing shows warnings immediately. Just changed shows
                        the state before a warning appears.
                    </Text>
                    {nodes.map((node, index) => (
                        <Row
                            key={node.url}
                            align="center"
                            justify="between"
                            gap="md">
                            <Text caption style={{ flexShrink: 1 }}>
                                {node.name || `Guardian ${index + 1}`}
                            </Text>
                            <Switch
                                accessibilityLabel={`${node.name || `Guardian ${index + 1}`} online`}
                                value={
                                    !!guardians[index] &&
                                    'online' in guardians[index]
                                }
                                onValueChange={online =>
                                    setGuardianOnline(index, online)
                                }
                            />
                        </Row>
                    ))}
                </>
            )}
        </Column>
    )
}

export default GuardianHealthSimulator
