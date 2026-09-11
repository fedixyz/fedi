import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import {
    DEFAULT_FI_SCENARIO,
    FI_SCENARIO_GROUPS,
    FI_SCENARIO_STORYBOARD_FRAMES,
    FI_SCREEN_GROUPS,
    FiDevSwitches,
    FiDevTools,
    FiPayerSource,
    FiScenarioName,
    FiScreen,
    FiScreenRoute,
    FiSimulatorSwitch,
    makeMockPayerFederation,
    MOCK_PAYER_FEDERATIONS,
    MOCK_PAYER_FEDERATION_IDS,
} from '@fedi/common/devtools/fi'
import { useToast } from '@fedi/common/hooks/toast'
import {
    clearFiLiquidity,
    clearWalletServiceSelectionPreview,
    removeFederations,
    setFiStatus,
    upsertFederation,
} from '@fedi/common/redux'

import SvgImage from '../../components/ui/SvgImage'
import { useAppDispatch } from '../../state/hooks'

/** The simulator's own actions, which are not a scenario to choose between. */
const SIMULATOR_TOOLS_GROUP = 'Simulator tools'

const groupTitleFor = (scenario: FiScenarioName): string | undefined =>
    FI_SCENARIO_GROUPS.find(group =>
        (group.scenarios as ReadonlyArray<FiScenarioName>).includes(scenario),
    )?.title

const SIMULATOR_OPTIONS: FiSimulatorSwitch[] = ['on', 'off']
const PAYER_SOURCE_OPTIONS: FiPayerSource[] = ['real', 'mock', 'none']

const titleCase = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1)

function SegmentedRow<T extends string>({
    label,
    options,
    value,
    onSelect,
}: {
    label: string
    options: T[]
    value: T
    onSelect: (option: T) => void
}) {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <View>
            <Text small style={style.switchLabel}>
                {label}
            </Text>
            <View style={style.segmentedRow}>
                {options.map(option => (
                    <Button
                        key={option}
                        title={titleCase(option)}
                        day={option !== value}
                        onPress={() => onSelect(option)}
                    />
                ))}
            </View>
        </View>
    )
}

const WalletServiceDevTools: React.FC<{
    tools: FiDevTools
    navigation: { navigate: (route: FiScreenRoute) => void }
}> = ({ tools, navigation }) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const toast = useToast()
    const dispatch = useAppDispatch()
    const [switches, setSwitchesState] = useState<FiDevSwitches>(() =>
        tools.getSwitches(),
    )
    const [fiScenario, setFiScenario] =
        useState<FiScenarioName>(DEFAULT_FI_SCENARIO)
    // opens on whichever group holds the active scenario, so the screen starts
    // showing where you already are rather than fully closed
    const [openFiGroup, setOpenFiGroup] = useState<string | null>(
        () => groupTitleFor(DEFAULT_FI_SCENARIO) ?? null,
    )
    const [needsRelaunch, setNeedsRelaunch] = useState(false)
    const [isScreenListOpen, setIsScreenListOpen] = useState(false)
    const [openScreenGroup, setOpenScreenGroup] = useState<string | null>(null)
    const isSimulatorOn = switches.simulator === 'on'

    const handleSimulatorChange = async (simulator: FiSimulatorSwitch) => {
        const next = { ...switches, simulator }
        setSwitchesState(next)
        await tools.setSwitches(next)
        setNeedsRelaunch(true)
    }

    const handlePayerSourceChange = async (payerSource: FiPayerSource) => {
        if (payerSource === 'mock') {
            MOCK_PAYER_FEDERATIONS.forEach(mock =>
                dispatch(upsertFederation(makeMockPayerFederation(mock))),
            )
        } else {
            dispatch(removeFederations(MOCK_PAYER_FEDERATION_IDS))
        }
        const next = { ...switches, payerSource }
        setSwitchesState(next)
        await tools.setSwitches(next)
    }

    const handleGoToScreen = async (screen: FiScreen) => {
        dispatch(clearFiLiquidity())
        dispatch(clearWalletServiceSelectionPreview())
        try {
            const target = await tools.jumpTo(screen.id)
            setIsScreenListOpen(false)
            navigation.navigate(target.route)
        } catch (e) {
            toast.show({ content: `Jump failed: ${e}`, status: 'error' })
        }
    }

    // Everything the simulator ever put in front of the app: seeded payers,
    // mock joined services, the formed wallet service and its formation. Redux
    // learned of them through the same events the bridge sends, so they are
    // dropped here explicitly rather than waiting for the next wholesale
    // refresh to stop riding them along.
    const handleClearSimulatedState = () => {
        tools.player.cancel()
        const seededIds = [
            ...tools.simulator.listMockFederations().map(f => f.id),
            ...MOCK_PAYER_FEDERATION_IDS,
        ]
        tools.simulator.clearSimulatedState()
        dispatch(removeFederations(seededIds))
        dispatch(setFiStatus({ type: 'idle' }))
        dispatch(clearFiLiquidity())
        dispatch(clearWalletServiceSelectionPreview())
        toast.show({
            content: 'Simulated wallet service state cleared',
            status: 'info',
        })
    }

    return (
        <View style={style.section}>
            <Text bold style={style.sectionTitle}>
                Wallet Service simulator
            </Text>
            <SegmentedRow
                label="Simulator"
                options={SIMULATOR_OPTIONS}
                value={switches.simulator}
                onSelect={handleSimulatorChange}
            />
            <SegmentedRow
                label="Payer source"
                options={PAYER_SOURCE_OPTIONS}
                value={switches.payerSource}
                onSelect={handlePayerSourceChange}
            />
            <Text small style={style.switchLabel}>
                Real admits every wallet the app holds at its real balance; the
                payment stays simulated. None reaches the no-payer gate, which
                is where the join frames start.
            </Text>
            {needsRelaunch && (
                <Text caption style={style.switchLabel}>
                    Quit and relaunch the app to apply the simulator switch.
                </Text>
            )}
            <Text small style={style.switchLabel}>
                The FI backend cannot complete a formation in dev, so the
                fiClient* RPCs resolve from an in-memory simulator. Pick the
                environment the wallet service flow should see. The storyboard
                frames each scenario reaches are named in the toast, so screen
                and storyboard can be matched without guessing.
            </Text>
            <CollapsibleSection
                testID="go-to-screen-section"
                title="Go to screen"
                count={FI_SCREEN_GROUPS.reduce(
                    (n, group) => n + group.screens.length,
                    0,
                )}
                isOpen={isScreenListOpen}
                onToggle={() => setIsScreenListOpen(open => !open)}>
                {!isSimulatorOn ? (
                    <Text caption style={style.switchLabel}>
                        Turn the simulator on to jump to a screen.
                    </Text>
                ) : (
                    FI_SCREEN_GROUPS.map(group => (
                        <CollapsibleSection
                            key={group.title}
                            title={group.title}
                            count={group.screens.length}
                            isOpen={openScreenGroup === group.title}
                            nested
                            onToggle={() =>
                                setOpenScreenGroup(current =>
                                    current === group.title
                                        ? null
                                        : group.title,
                                )
                            }>
                            {group.screens.map(screen => (
                                <Button
                                    key={screen.id}
                                    title={screen.label}
                                    type="outline"
                                    containerStyle={style.buttonContainer}
                                    onPress={() => handleGoToScreen(screen)}
                                />
                            ))}
                        </CollapsibleSection>
                    ))
                )}
            </CollapsibleSection>
            {FI_SCENARIO_GROUPS.map(group => (
                <CollapsibleSection
                    key={group.title}
                    title={group.title}
                    count={group.scenarios.length}
                    isOpen={openFiGroup === group.title}
                    // one open at a time: these are alternatives, and
                    // the list is only long because it is all of them
                    onToggle={() =>
                        setOpenFiGroup(current =>
                            current === group.title ? null : group.title,
                        )
                    }>
                    {group.scenarios.map(name => (
                        <Button
                            key={name}
                            title={name === fiScenario ? `✓ ${name}` : name}
                            day={name !== fiScenario}
                            containerStyle={style.buttonContainer}
                            onPress={() => {
                                tools.player.cancel()
                                tools.simulator.setScenario(name)
                                setFiScenario(name)
                                toast.show({
                                    content: `Wallet Service scenario: ${name}${
                                        FI_SCENARIO_STORYBOARD_FRAMES[name]
                                            ? ` — ${FI_SCENARIO_STORYBOARD_FRAMES[name]}`
                                            : ''
                                    }`,
                                    status: 'info',
                                })
                            }}
                        />
                    ))}
                </CollapsibleSection>
            ))}
            <CollapsibleSection
                title={SIMULATOR_TOOLS_GROUP}
                count={2}
                isOpen={openFiGroup === SIMULATOR_TOOLS_GROUP}
                onToggle={() =>
                    setOpenFiGroup(current =>
                        current === SIMULATOR_TOOLS_GROUP
                            ? null
                            : SIMULATOR_TOOLS_GROUP,
                    )
                }>
                <Text small style={style.switchLabel}>
                    The external-deposit branch of the top-up sheet waits for a
                    Lightning payment nobody in dev can make. This settles every
                    invoice the simulator has handed out, which is what the
                    storyboard's A6 to A7 step is.
                </Text>
                <Button
                    day
                    title="Settle open simulated deposits"
                    containerStyle={style.buttonContainer}
                    onPress={() => {
                        tools.simulator.settleOpenDeposits()
                        toast.show({
                            content: 'Simulated deposits settled',
                            status: 'info',
                        })
                    }}
                />
                <Text small style={style.switchLabel}>
                    Removes every wallet and formation the simulator seeded, so
                    a device holding real wallets can be checked with nothing
                    invented in the way. Real wallet-service state on the bridge
                    is untouched; that is "Wipe all wallet-service test state".
                </Text>
                <Button
                    day
                    title="Clear simulated wallet service state"
                    containerStyle={style.buttonContainer}
                    onPress={handleClearSimulatedState}
                />
            </CollapsibleSection>
        </View>
    )
}

/**
 * A section inside a section, collapsed until asked for.
 *
 * The scenario list is thirty entries and every one of them is a button, so
 * shown flat it buries every other developer setting under a wall of them.
 * Local to this panel: nothing else has enough rows to need it.
 */
const CollapsibleSection: React.FC<{
    title: string
    /** Rows inside, shown in the header so a closed group still counts. */
    count: number
    isOpen: boolean
    onToggle: () => void
    children: React.ReactNode
    /** Drops the outer border for a section nested inside another one. */
    nested?: boolean
    testID?: string
}> = ({ title, count, isOpen, onToggle, children, nested, testID }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <View testID={testID} style={nested ? undefined : style.collapsible}>
            <Pressable
                onPress={onToggle}
                style={style.collapsibleHeader}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}>
                <SvgImage
                    name="ChevronRight"
                    size={16}
                    color={theme.colors.grey}
                    svgProps={{
                        style: {
                            transform: [{ rotate: isOpen ? '90deg' : '0deg' }],
                        },
                    }}
                />
                <Text medium style={style.collapsibleTitle}>
                    {title}
                </Text>
                <Text small style={style.collapsibleCount}>
                    {count}
                </Text>
            </Pressable>
            {isOpen && <View>{children}</View>}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        section: {
            paddingBottom: theme.spacing.lg,
        },
        sectionTitle: {
            marginVertical: theme.spacing.md,
        },
        segmentedRow: {
            flexDirection: 'row',
            gap: theme.spacing.sm,
            marginBottom: theme.spacing.md,
        },
        collapsible: {
            borderBottomColor: theme.colors.extraLightGrey,
            borderBottomWidth: 1,
        },
        collapsibleHeader: {
            alignItems: 'center',
            flexDirection: 'row',
            gap: theme.spacing.sm,
            paddingVertical: theme.spacing.md,
        },
        collapsibleTitle: {
            flex: 1,
        },
        collapsibleCount: {
            color: theme.colors.grey,
        },
        buttonContainer: {
            marginBottom: theme.spacing.md,
        },
        switchLabel: {
            textAlign: 'left',
            marginBottom: theme.spacing.xs,
        },
    })

export default WalletServiceDevTools
