import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import {
    FI_SCREEN_GROUPS,
    FI_SCRIPT_GROUPS,
    FiDevSwitches,
    FiDevTools,
    FiPayerSource,
    FiScreen,
    FiSimulatorSwitch,
    makeMockPayerFederation,
    MOCK_PAYER_FEDERATIONS,
    MOCK_PAYER_FEDERATION_IDS,
} from '@fedi/common/devtools/fi'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    clearFiLiquidity,
    clearWalletServiceSelectionPreview,
    prepareWalletServicePayment,
    removeFederations,
    setFiStatus,
    upsertFederation,
} from '@fedi/common/redux'

import SvgImage from '../../components/ui/SvgImage'
import { useAppDispatch } from '../../state/hooks'
import { RootStackParamList } from '../../types/navigation'

const SCRIPT_COUNT = FI_SCRIPT_GROUPS.reduce(
    (n, group) => n + group.scripts.length,
    0,
)
const SCREEN_COUNT = FI_SCREEN_GROUPS.reduce(
    (n, group) => n + group.screens.length,
    0,
)
// the settle and clear buttons
const ADVANCED_TOOL_COUNT = 2

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
    navigation: Pick<NativeStackNavigationProp<RootStackParamList>, 'navigate'>
}> = ({ tools, navigation }) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const toast = useToast()
    const fedimint = useFedimint()
    const dispatch = useAppDispatch()
    const [switches, setSwitchesState] = useState<FiDevSwitches>(() =>
        tools.getSwitches(),
    )
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
    const [isPlayListOpen, setIsPlayListOpen] = useState(false)
    const [openPlayGroup, setOpenPlayGroup] = useState<string | null>(null)
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

    // navigate's overloads pair each route with its own params type, so a
    // route held in a union has to be handed over one literal at a time;
    // any route not listed here has its params dropped
    const navigateToScreen = (target: FiScreen) => {
        switch (target.route) {
            case 'WalletServiceSettings':
                return navigation.navigate(target.route, target.params)
            default:
                return navigation.navigate(target.route)
        }
    }

    const handleGoToScreen = async (screen: FiScreen) => {
        dispatch(clearFiLiquidity())
        dispatch(clearWalletServiceSelectionPreview())
        try {
            const target = await tools.jumpTo(screen.id)
            // Confirm renders a spinner until a selection preview exists, and
            // only Create's Continue fetches one. Fetch it here so the
            // script's stubs (slow quote, payer lookup failure) apply to it.
            if (target.route === 'ConfirmWalletService') {
                await dispatch(
                    prepareWalletServicePayment({ fedimint }),
                ).unwrap()
            }
            setIsScreenListOpen(false)
            navigateToScreen(target)
        } catch (e) {
            toast.show({ content: `Jump failed: ${e}`, status: 'error' })
        }
    }

    const handlePlay = (scriptName: string) => {
        dispatch(clearFiLiquidity())
        dispatch(clearWalletServiceSelectionPreview())
        try {
            tools.play(scriptName)
            toast.show({
                content: `Playing ${scriptName} from the start`,
                status: 'info',
            })
        } catch (e) {
            toast.show({ content: `Play failed: ${e}`, status: 'error' })
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
                fiClient* RPCs resolve from an in-memory simulator. Go to screen
                puts the flow straight on the screen you picked; Advanced plays
                a whole scenario at its real pace and holds the state tools.
            </Text>
            <CollapsibleSection
                testID="go-to-screen-section"
                title="Go to screen"
                count={SCREEN_COUNT}
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
            <CollapsibleSection
                testID="advanced-section"
                title="Advanced"
                count={SCRIPT_COUNT + ADVANCED_TOOL_COUNT}
                isOpen={isAdvancedOpen}
                onToggle={() => setIsAdvancedOpen(open => !open)}>
                <CollapsibleSection
                    title="Play scenario from start"
                    count={SCRIPT_COUNT}
                    isOpen={isPlayListOpen}
                    nested
                    onToggle={() => setIsPlayListOpen(open => !open)}>
                    {!isSimulatorOn ? (
                        <Text caption style={style.switchLabel}>
                            Turn the simulator on to play a scenario.
                        </Text>
                    ) : (
                        FI_SCRIPT_GROUPS.map(group => (
                            <CollapsibleSection
                                key={group.title}
                                title={group.title}
                                count={group.scripts.length}
                                isOpen={openPlayGroup === group.title}
                                nested
                                onToggle={() =>
                                    setOpenPlayGroup(current =>
                                        current === group.title
                                            ? null
                                            : group.title,
                                    )
                                }>
                                {group.scripts.map(script => (
                                    <Button
                                        key={script.name}
                                        title={script.name}
                                        type="outline"
                                        containerStyle={style.buttonContainer}
                                        onPress={() => handlePlay(script.name)}
                                    />
                                ))}
                            </CollapsibleSection>
                        ))
                    )}
                </CollapsibleSection>
                <Text small style={style.switchLabel}>
                    The external-deposit branch of the top-up sheet waits for a
                    Lightning payment nobody in dev can make. This settles every
                    invoice the simulator has handed out.
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
 * The screen list is long enough that, shown flat, it buries every other
 * developer setting. Local to this panel: nothing else has enough rows.
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
