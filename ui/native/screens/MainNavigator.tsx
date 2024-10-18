import { useNavigation } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Text } from '@rneui/themed'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { selectSocialRecoveryState } from '@fedi/common/redux'

import AddFediModHeader from '../components/feature/admin/AddFediModHeader'
import CurrencySettingsHeader from '../components/feature/admin/CurrencySettingsHeader'
import EditProfileSettingsHeader from '../components/feature/admin/EditProfileSettingsHeader'
import FediModSettingsHeader from '../components/feature/admin/FediModSettingsHeader'
import LanguageSettingsHeader from '../components/feature/admin/LanguageSettingsHeader'
import SettingsHeader from '../components/feature/admin/SettingsHeader'
import ChooseBackupMethodHeader from '../components/feature/backup/ChooseBackupMethodHeader'
import PersonalBackupHeader from '../components/feature/backup/PersonalBackupHeader'
import RecoveryWordsHeader from '../components/feature/backup/RecoveryWordsHeader'
import SocialBackupHeader from '../components/feature/backup/SocialBackupHeader'
import BugReportHeader from '../components/feature/bug/BugReportHeader'
import ChatConversationHeader from '../components/feature/chat/ChatConversationHeader'
import ConfirmJoinPublicGroupHeader from '../components/feature/chat/ConfirmJoinPublicGroupHeader'
import DefaultChatHeader from '../components/feature/chat/DefaultChatHeader'
import FederationDetailsHeader from '../components/feature/federations/FederationDetailsHeader'
import FederationInviteHeader from '../components/feature/federations/FederationInviteHeader'
import JoinFederationHeader from '../components/feature/federations/JoinFederationHeader'
import PopupFederationEndedHeader from '../components/feature/federations/PopupFederationEndedHeader'
import NostrSettingsHeader from '../components/feature/fedimods/NostrSettingsHeader'
import EulaHeader from '../components/feature/onboarding/EulaHeader'
import NewMemberAvatarImageHeader from '../components/feature/onboarding/NewMemberAvatarImageHeader'
import NewMemberHeader from '../components/feature/onboarding/NewMemberHeader'
import ChangePinLockScreenHeader from '../components/feature/pin/ChangePinLockScreenHeader'
import CreatePinInstructionsHeader from '../components/feature/pin/CreatePinInstructionsHeader'
import NostrSettingsLockScreen from '../components/feature/pin/NostrSettingsLockScreen'
import PinAccessHeader from '../components/feature/pin/PinAccessHeader'
import ResetPinHeader from '../components/feature/pin/ResetPinHeader'
import ResetPinStartHeader from '../components/feature/pin/ResetPinStartHeader'
import SetPinHeader from '../components/feature/pin/SetPinHeader'
import SetPinLockScreen from '../components/feature/pin/SetPinLockScreen'
import UnlockAppLockScreenHeader from '../components/feature/pin/UnlockAppLockScreenHeader'
import BitcoinRequestHeader from '../components/feature/receive/BitcoinRequestHeader'
import ReceiveBitcoinHeader from '../components/feature/receive/ReceiveBitcoinHeader'
import ReceiveBitcoinOfflineHeader from '../components/feature/receive/ReceiveBitcoinOfflineHeader'
import ReceiveCashuHeader from '../components/feature/receive/ReceiveCashuHeader'
import ReceiveLightningHeader from '../components/feature/receive/ReceiveLightningHeader'
import ChooseRecoveryMethodHeader from '../components/feature/recovery/ChooseRecoveryMethodHeader'
import PersonalRecoveryHeader from '../components/feature/recovery/PersonalRecoveryHeader'
import RecoveryAssistHeader from '../components/feature/recovery/RecoveryAssistHeader'
import RecoveryDeviceSelectionHeader from '../components/feature/recovery/RecoveryDeviceSelectionHeader'
import RecoveryNewWalletHeader from '../components/feature/recovery/RecoveryNewWalletHeader'
import RecoveryWalletTransferHeader from '../components/feature/recovery/RecoveryWalletTransferHeader'
import SocialRecoveryHeader from '../components/feature/recovery/SocialRecoveryHeader'
import ConfirmSendEcashHeader from '../components/feature/send/ConfirmSendEcashHeader'
import SendBitcoinHeader from '../components/feature/send/SendBitcoinHeader'
import SendBitcoinOfflineHeader from '../components/feature/send/SendBitcoinOfflineHeader'
import SendBitcoinOfflineQrHeader from '../components/feature/send/SendBitcoinOfflineQrHeader'
import SendHeader from '../components/feature/send/SendHeader'
import ConfirmDepositHeader from '../components/feature/stabilitypool/ConfirmDepositHeader'
import ConfirmWithdrawHeader from '../components/feature/stabilitypool/ConfirmWithdrawHeader'
import DepositInitiatedHeader from '../components/feature/stabilitypool/DepositInitiatedHeader'
import StabilityDepositHeader from '../components/feature/stabilitypool/StabilityDepositHeader'
import StabilityHistoryHeader from '../components/feature/stabilitypool/StabilityHistoryHeader'
import StabilityHomeHeader from '../components/feature/stabilitypool/StabilityHomeHeader'
import StabilityWithdrawHeader from '../components/feature/stabilitypool/StabilityWithdrawHeader'
import StableBalanceIntroHeader from '../components/feature/stabilitypool/StableBalanceIntroHeader'
import WithdrawInitiatedHeader from '../components/feature/stabilitypool/WithdrawInitiatedHeader'
import TransactionsHeader from '../components/feature/transaction-history/TransactionsHeader'
import Header from '../components/ui/Header'
import { useAppSelector } from '../state/hooks'
import {
    resetAfterPersonalRecovery,
    resetToLockedDevice,
    resetToSocialRecovery,
} from '../state/navigation'
import { MSats } from '../types'
import { MAIN_NAVIGATOR_ID, RootStackParamList } from '../types/navigation'
import { useIsFeatureUnlocked } from '../utils/hooks/security'
import AddFediMod from './AddFediMod'
import BitcoinRequest from './BitcoinRequest'
import BugReport from './BugReport'
import BugReportSuccess from './BugReportSuccess'
import ChatRoomConversation from './ChatRoomConversation'
import ChatRoomInvite from './ChatRoomInvite'
import ChatRoomMembers from './ChatRoomMembers'
import ChatUserConversation from './ChatUserConversation'
import ChatWallet from './ChatWallet'
import ChooseBackupMethod from './ChooseBackupMethod'
import ChooseRecoveryMethod from './ChooseRecoveryMethod'
import CompleteRecoveryAssist from './CompleteRecoveryAssist'
import CompleteSocialBackup from './CompleteSocialBackup'
import CompleteSocialRecovery from './CompleteSocialRecovery'
import ConfirmJoinPublicGroup from './ConfirmJoinPublicGroup'
import ConfirmReceiveCashu from './ConfirmReceiveCashu'
import ConfirmReceiveOffline from './ConfirmReceiveOffline'
import ConfirmRecoveryAssist from './ConfirmRecoveryAssist'
import ConfirmSendChatPayment from './ConfirmSendChatPayment'
import ConfirmSendEcash from './ConfirmSendEcash'
import ConfirmSendLightning from './ConfirmSendLightning'
import ConfirmSendOnChain from './ConfirmSendOnChain'
import CreateGroup from './CreateGroup'
import CreatePinInstructions from './CreatePinInstructions'
import CreatedPin from './CreatedPin'
import CurrencySettings from './CurrencySettings'
import DeveloperSettings from './DeveloperSettings'
import EditGroup from './EditGroup'
import EditProfileSettings from './EditProfileSettings'
import EnterDisplayName from './EnterDisplayName'
import Eula from './Eula'
import FederationDetails from './FederationDetails'
import FederationGreeting from './FederationGreeting'
import FederationInvite from './FederationInvite'
import FediModBrowser from './FediModBrowser'
import FediModSettings from './FediModSettings'
import Initializing from './Initializing'
import JoinFederation from './JoinFederation'
import LanguageSettings from './LanguageSettings'
import LegacyChat from './LegacyChat'
import LocateSocialRecovery from './LocateSocialRecovery'
import LockScreen from './LockScreen'
import LockedDevice from './LockedDevice'
import NewMessage from './NewMessage'
import NostrSettings from './NostrSettings'
import PersonalRecovery from './PersonalRecovery'
import PersonalRecoverySuccess from './PersonalRecoverySuccess'
import PinAccess from './PinAccess'
import PopupFederationEnded from './PopupFederationEnded'
import PublicFederations from './PublicFederations'
import Receive from './Receive'
import ReceiveLightning from './ReceiveLightning'
import ReceiveSuccess from './ReceiveSuccess'
import RecordBackupVideo from './RecordBackupVideo'
import RecoveryAssistSuccess from './RecoveryAssistSuccess'
import RecoveryDeviceSelection from './RecoveryDeviceSelection'
import RecoveryNewWallet from './RecoveryNewWallet'
import RecoveryWalletOptions from './RecoveryWalletOptions'
import RecoveryWalletTransfer from './RecoveryWalletTransfer'
import RecoveryWords from './RecoveryWords'
import ResetPin from './ResetPin'
import ResetPinStart from './ResetPinStart'
import RoomSettings from './RoomSettings'
import ScanMemberCode from './ScanMemberCode'
import ScanSocialRecoveryCode from './ScanSocialRecoveryCode'
import SelectRecoveryFileFailure from './SelectRecoveryFileFailure'
import SelectRecoveryFileSuccess from './SelectRecoveryFileSuccess'
import Send from './Send'
import SendOfflineAmount from './SendOfflineAmount'
import SendOfflineQr from './SendOfflineQr'
import SendOnChainAmount from './SendOnChainAmount'
import SendSuccess from './SendSuccess'
import SetPin from './SetPin'
import Settings from './Settings'
import SocialBackupCloudUpload from './SocialBackupCloudUpload'
import SocialBackupProcessing from './SocialBackupProcessing'
import SocialBackupSuccess from './SocialBackupSuccess'
import SocialRecoveryFailure from './SocialRecoveryFailure'
import SocialRecoveryQrModal from './SocialRecoveryQrModal'
import SocialRecoverySuccess from './SocialRecoverySuccess'
import Splash from './Splash'
import StabilityConfirmDeposit from './StabilityConfirmDeposit'
import StabilityConfirmWithdraw from './StabilityConfirmWithdraw'
import StabilityDeposit from './StabilityDeposit'
import StabilityDepositInitiated from './StabilityDepositInitiated'
import StabilityHistory from './StabilityHistory'
import StabilityHome from './StabilityHome'
import StabilityWithdraw from './StabilityWithdraw'
import StabilityWithdrawInitiated from './StabilityWithdrawInitiated'
import StableBalanceIntro from './StableBalanceIntro'
import StartPersonalBackup from './StartPersonalBackup'
import StartRecoveryAssist from './StartRecoveryAssist'
import StartSocialBackup from './StartSocialBackup'
import TabsNavigator from './TabsNavigator'
import Transactions from './Transactions'
import UploadAvatarImage from './UploadAvatarImage'

const Stack = createNativeStackNavigator<RootStackParamList>()

export const MainNavigator = () => {
    const { t } = useTranslation()
    const isAppUnlocked = useIsFeatureUnlocked('app')
    const isChangePinUnlocked = useIsFeatureUnlocked('changePin')
    const isNostrSettingsUnlocked = useIsFeatureUnlocked('nostrSettings')
    const socialRecoveryState = useAppSelector(selectSocialRecoveryState)
    const deviceIndexRequired = useAppSelector(
        s => s.recovery.deviceIndexRequired,
    )
    const shouldLockDevice = useAppSelector(s => s.recovery.shouldLockDevice)
    const navigation = useNavigation()

    useEffect(() => {
        if (socialRecoveryState && navigation) {
            navigation.dispatch(resetToSocialRecovery())
        }
    }, [navigation, socialRecoveryState])

    // Navigates to personal recovery success since this means the user entered
    // seed words but quit the app before completing device index selection
    useEffect(() => {
        if (deviceIndexRequired && navigation) {
            navigation.dispatch(resetAfterPersonalRecovery())
        }
    }, [navigation, deviceIndexRequired])

    // Navigates to locked device screen if we detect a device conflict
    useEffect(() => {
        if (shouldLockDevice && navigation) {
            navigation.dispatch(resetToLockedDevice())
        }
    }, [navigation, shouldLockDevice])

    return (
        <Stack.Navigator
            screenOptions={{
                orientation: 'portrait',
            }}
            initialRouteName={'Initializing'}
            id={MAIN_NAVIGATOR_ID}>
            <>
                {/* This group of screens may render regardless of the value of
                 activeFederation */}
                <Stack.Group
                    screenOptions={{
                        animation: 'fade',
                        animationDuration: 250,
                    }}>
                    <Stack.Screen
                        name="Splash"
                        component={Splash}
                        options={{
                            headerShown: false,
                        }}
                    />
                    <Stack.Screen
                        name="Initializing"
                        component={Initializing}
                        options={{
                            headerShown: false,
                        }}
                    />
                    <Stack.Screen
                        name="JoinFederation"
                        component={JoinFederation}
                        options={() => ({
                            header: () => <JoinFederationHeader />,
                        })}
                    />
                    <Stack.Screen
                        name="PublicFederations"
                        component={PublicFederations}
                        options={() => ({
                            header: () => <Header backButton />,
                        })}
                    />
                    <Stack.Screen
                        name="Eula"
                        component={Eula}
                        options={{
                            header: () => <EulaHeader />,
                        }}
                    />
                    <Stack.Screen
                        name="PersonalRecoverySuccess"
                        component={PersonalRecoverySuccess}
                        options={{ headerShown: false }}
                    />
                    <Stack.Screen
                        name="RecoveryWalletOptions"
                        component={RecoveryWalletOptions}
                        options={{ headerShown: false }}
                    />
                    <Stack.Screen
                        name="RecoveryWalletTransfer"
                        component={RecoveryWalletTransfer}
                        options={() => ({
                            header: () => <RecoveryWalletTransferHeader />,
                        })}
                    />
                    <Stack.Screen
                        name="RecoveryNewWallet"
                        component={RecoveryNewWallet}
                        options={() => ({
                            header: () => <RecoveryNewWalletHeader />,
                        })}
                    />
                    <Stack.Screen
                        name="RecoveryDeviceSelection"
                        component={RecoveryDeviceSelection}
                        options={() => ({
                            header: () => <RecoveryDeviceSelectionHeader />,
                        })}
                    />
                    <Stack.Screen
                        name="LockedDevice"
                        component={LockedDevice}
                        options={{ headerShown: false }}
                    />
                    <Stack.Screen
                        name="CompleteSocialRecovery"
                        component={CompleteSocialRecovery}
                        options={() => ({
                            header: () => <SocialRecoveryHeader cancelButton />,
                        })}
                    />
                </Stack.Group>
                {/*
                    This group of screens relies on a non-null activeFederation
                    in the federation reducer because they contain API calls to
                    the FFI NativeModule. Since it is possible to store multiple
                    federation connections in-app, each call requires a
                    Federation to be specified
                */}
                {isAppUnlocked ? (
                    <Stack.Group>
                        <Stack.Group
                            screenOptions={{
                                animation: 'fade',
                                animationDuration: 250,
                            }}>
                            <Stack.Screen
                                name="TabsNavigator"
                                component={TabsNavigator}
                                options={{ headerShown: false }}
                            />
                            {/* FediMods */}
                            <Stack.Screen
                                name="FediModBrowser"
                                component={FediModBrowser}
                                options={{
                                    headerShown: false,
                                }}
                            />
                            {/* Federation Onboarding */}
                            <Stack.Screen
                                name="EnterDisplayName"
                                component={EnterDisplayName}
                                options={() => ({
                                    header: () => <NewMemberHeader />,
                                    animation: 'fade',
                                    animationDuration: 300,
                                })}
                            />
                            <Stack.Screen
                                name="UploadAvatarImage"
                                component={UploadAvatarImage}
                                options={() => ({
                                    header: () => (
                                        <NewMemberAvatarImageHeader />
                                    ),
                                    animation: 'fade',
                                    animationDuration: 300,
                                })}
                            />
                            <Stack.Screen
                                name="FederationGreeting"
                                component={FederationGreeting}
                                options={{ headerShown: false }}
                            />
                            {/* Chat */}
                            <Stack.Group
                                screenOptions={{
                                    header: () => <DefaultChatHeader />,
                                }}>
                                <Stack.Screen
                                    name="NewMessage"
                                    component={NewMessage}
                                    options={() => ({
                                        header: () => (
                                            <DefaultChatHeader
                                                title={t(
                                                    'feature.chat.new-message',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="ScanMemberCode"
                                    component={ScanMemberCode}
                                    options={() => ({
                                        header: () => (
                                            <DefaultChatHeader
                                                title={t(
                                                    'feature.chat.scan-user-code',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="ChatRoomConversation"
                                    component={ChatRoomConversation}
                                    options={() => ({
                                        header: () => (
                                            <ChatConversationHeader />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="ChatRoomMembers"
                                    component={ChatRoomMembers}
                                />
                                <Stack.Screen
                                    name="ChatRoomInvite"
                                    component={ChatRoomInvite}
                                />
                                <Stack.Screen
                                    name="ConfirmJoinPublicGroup"
                                    component={ConfirmJoinPublicGroup}
                                    options={() => ({
                                        header: () => (
                                            <ConfirmJoinPublicGroupHeader />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="ChatUserConversation"
                                    component={ChatUserConversation}
                                    options={() => ({
                                        header: () => (
                                            <ChatConversationHeader />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="CreateGroup"
                                    component={CreateGroup}
                                    options={() => ({
                                        header: () => (
                                            <DefaultChatHeader
                                                title={t(
                                                    'feature.chat.create-a-group',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="EditGroup"
                                    component={EditGroup}
                                    options={() => ({
                                        header: () => (
                                            <DefaultChatHeader
                                                title={t(
                                                    'feature.chat.change-group-name',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="RoomSettings"
                                    component={RoomSettings}
                                />
                                <Stack.Screen
                                    name="ChatWallet"
                                    component={ChatWallet}
                                />
                                <Stack.Screen
                                    name="ConfirmSendChatPayment"
                                    component={ConfirmSendChatPayment}
                                    options={() => ({
                                        header: () => (
                                            <DefaultChatHeader
                                                title={t(
                                                    'phrases.confirm-chat-send',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="LegacyChat"
                                    component={LegacyChat}
                                    options={() => ({
                                        header: () => (
                                            <DefaultChatHeader
                                                title={t(
                                                    'feature.chat.archived-chats',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                            </Stack.Group>

                            {/* Wallet (Send) */}
                            <Stack.Screen
                                name="Send"
                                component={Send}
                                options={() => ({
                                    header: () => <SendHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="ConfirmSendLightning"
                                component={ConfirmSendLightning}
                                options={() => ({
                                    header: () => <SendBitcoinHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="SendOnChainAmount"
                                component={SendOnChainAmount}
                                options={() => ({
                                    header: () => <SendBitcoinHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="ConfirmSendOnChain"
                                component={ConfirmSendOnChain}
                                options={() => ({
                                    header: () => <SendBitcoinHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="SendSuccess"
                                component={SendSuccess}
                                initialParams={{
                                    amount: 0 as MSats,
                                    unit: 'sats',
                                }}
                                options={{ headerShown: false }}
                            />
                            {/* Wallet (Send Offline) */}
                            <Stack.Screen
                                name="SendOfflineAmount"
                                component={SendOfflineAmount}
                                options={() => ({
                                    header: () => <SendBitcoinOfflineHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="ConfirmSendEcash"
                                component={ConfirmSendEcash}
                                options={() => ({
                                    header: () => <ConfirmSendEcashHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="SendOfflineQr"
                                component={SendOfflineQr}
                                options={() => ({
                                    header: () => (
                                        <SendBitcoinOfflineQrHeader />
                                    ),
                                })}
                            />
                            {/* Wallet (Receive) */}
                            <Stack.Screen
                                name="Receive"
                                component={Receive}
                                options={() => ({
                                    header: () => <ReceiveBitcoinHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="BitcoinRequest"
                                component={BitcoinRequest}
                                options={() => ({
                                    header: () => <BitcoinRequestHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="ReceiveLightning"
                                component={ReceiveLightning}
                                options={() => ({
                                    header: () => <ReceiveLightningHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="ConfirmReceiveOffline"
                                component={ConfirmReceiveOffline}
                                options={() => ({
                                    header: () => (
                                        <ReceiveBitcoinOfflineHeader />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="ConfirmReceiveCashu"
                                component={ConfirmReceiveCashu}
                                options={() => ({
                                    header: () => <ReceiveCashuHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="ReceiveSuccess"
                                component={ReceiveSuccess}
                                options={{ headerShown: false }}
                            />
                            {/* Transaction history */}
                            <Stack.Screen
                                name="Transactions"
                                component={Transactions}
                                options={() => ({
                                    header: () => <TransactionsHeader />,
                                })}
                            />
                            {/* Federations */}
                            <Stack.Screen
                                name="FederationInvite"
                                component={FederationInvite}
                                options={() => ({
                                    header: () => <FederationInviteHeader />,
                                })}
                            />
                            {/* Backup & Recovery */}
                            <Stack.Screen
                                name="ChooseBackupMethod"
                                component={ChooseBackupMethod}
                                options={() => ({
                                    header: () => <ChooseBackupMethodHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="ChooseRecoveryMethod"
                                component={ChooseRecoveryMethod}
                                options={() => ({
                                    header: () => (
                                        <ChooseRecoveryMethodHeader />
                                    ),
                                })}
                            />
                            {/* Social Backup */}
                            <Stack.Screen
                                name="RecordBackupVideo"
                                component={RecordBackupVideo}
                                options={() => ({
                                    header: () => (
                                        <SocialBackupHeader backButton />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="StartSocialBackup"
                                component={StartSocialBackup}
                                options={() => ({
                                    header: () => (
                                        <SocialBackupHeader backButton />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="SocialBackupProcessing"
                                component={SocialBackupProcessing}
                                options={() => ({
                                    header: () => (
                                        <SocialBackupHeader closeButton />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="SocialBackupCloudUpload"
                                component={SocialBackupCloudUpload}
                                options={() => ({
                                    header: () => (
                                        <SocialBackupHeader closeButton />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="CompleteSocialBackup"
                                component={CompleteSocialBackup}
                                options={() => ({
                                    header: () => (
                                        <SocialBackupHeader closeButton />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="SocialBackupSuccess"
                                component={SocialBackupSuccess}
                                options={{ headerShown: false }}
                            />
                            {/* Social Recovery */}
                            <Stack.Screen
                                name="LocateSocialRecovery"
                                component={LocateSocialRecovery}
                                options={() => ({
                                    header: () => (
                                        <SocialRecoveryHeader backButton />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="SelectRecoveryFileSuccess"
                                component={SelectRecoveryFileSuccess}
                                options={{ headerShown: false }}
                            />
                            <Stack.Screen
                                name="SelectRecoveryFileFailure"
                                component={SelectRecoveryFileFailure}
                                options={{ headerShown: false }}
                            />
                            <Stack.Screen
                                name="SocialRecoveryFailure"
                                component={SocialRecoveryFailure}
                                options={{ headerShown: false }}
                            />
                            <Stack.Screen
                                name="SocialRecoverySuccess"
                                component={SocialRecoverySuccess}
                                options={{ headerShown: false }}
                            />
                            {/* Recovery Assist (Guardians) */}
                            <Stack.Screen
                                name="StartRecoveryAssist"
                                component={StartRecoveryAssist}
                                options={() => ({
                                    header: () => (
                                        <RecoveryAssistHeader backButton />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="ConfirmRecoveryAssist"
                                component={ConfirmRecoveryAssist}
                                options={() => ({
                                    header: () => (
                                        <RecoveryAssistHeader backButton />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="ScanSocialRecoveryCode"
                                component={ScanSocialRecoveryCode}
                                options={() => ({
                                    header: () => (
                                        <RecoveryAssistHeader
                                            backButton
                                            closeButton
                                        />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="CompleteRecoveryAssist"
                                component={CompleteRecoveryAssist}
                                options={() => ({
                                    header: () => (
                                        <RecoveryAssistHeader backButton />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="RecoveryAssistSuccess"
                                component={RecoveryAssistSuccess}
                                options={{ headerShown: false }}
                            />
                            {/* Personal Backup */}
                            <Stack.Screen
                                name="StartPersonalBackup"
                                component={StartPersonalBackup}
                                options={() => ({
                                    header: () => <PersonalBackupHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="RecoveryWords"
                                component={RecoveryWords}
                                options={() => ({
                                    header: () => <RecoveryWordsHeader />,
                                })}
                            />
                            {/* Personal Recovery */}
                            <Stack.Screen
                                name="PersonalRecovery"
                                component={PersonalRecovery}
                                options={() => ({
                                    header: () => (
                                        <PersonalRecoveryHeader backButton />
                                    ),
                                })}
                            />
                            {/* Popup federations */}
                            <Stack.Screen
                                name="PopupFederationEnded"
                                component={PopupFederationEnded}
                                options={() => ({
                                    header: () => (
                                        <PopupFederationEndedHeader />
                                    ),
                                })}
                            />
                            {/* Settings */}
                            <Stack.Screen
                                name="Settings"
                                component={Settings}
                                options={() => ({
                                    header: () => <SettingsHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="FediModSettings"
                                component={FediModSettings}
                                options={() => ({
                                    header: () => <FediModSettingsHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="AddFediMod"
                                component={AddFediMod}
                                options={() => ({
                                    header: () => <AddFediModHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="EditProfileSettings"
                                component={EditProfileSettings}
                                options={() => ({
                                    header: () => <EditProfileSettingsHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="LanguageSettings"
                                component={LanguageSettings}
                                options={() => ({
                                    header: () => <LanguageSettingsHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="CurrencySettings"
                                component={CurrencySettings}
                                options={() => ({
                                    header: () => <CurrencySettingsHeader />,
                                })}
                            />
                            {isChangePinUnlocked ? (
                                <Stack.Group>
                                    <Stack.Screen
                                        name="SetPin"
                                        component={SetPin}
                                        options={() => ({
                                            header: () => <SetPinHeader />,
                                        })}
                                    />
                                </Stack.Group>
                            ) : (
                                <Stack.Group>
                                    <Stack.Screen
                                        name="SetPin"
                                        component={SetPinLockScreen}
                                        options={() => ({
                                            header: () => (
                                                <ChangePinLockScreenHeader />
                                            ),
                                        })}
                                    />
                                </Stack.Group>
                            )}
                            <Stack.Screen
                                name="CreatedPin"
                                component={CreatedPin}
                                options={{ headerShown: false }}
                            />
                            <Stack.Screen
                                name="CreatePinInstructions"
                                component={CreatePinInstructions}
                                options={() => ({
                                    header: () => (
                                        <CreatePinInstructionsHeader />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="PinAccess"
                                component={PinAccess}
                                options={() => ({
                                    header: () => <PinAccessHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="FederationDetails"
                                component={FederationDetails}
                                options={() => ({
                                    header: () => <FederationDetailsHeader />,
                                })}
                            />
                            {/* Stability Pools */}
                            <Stack.Screen
                                name="StabilityHome"
                                component={StabilityHome}
                                options={() => ({
                                    header: () => <StabilityHomeHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="StabilityHistory"
                                component={StabilityHistory}
                                options={() => ({
                                    header: () => <StabilityHistoryHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="StabilityDeposit"
                                component={StabilityDeposit}
                                options={() => ({
                                    header: () => <StabilityDepositHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="StabilityWithdraw"
                                component={StabilityWithdraw}
                                options={() => ({
                                    header: () => <StabilityWithdrawHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="StabilityConfirmDeposit"
                                component={StabilityConfirmDeposit}
                                options={() => ({
                                    header: () => <ConfirmDepositHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="StabilityConfirmWithdraw"
                                component={StabilityConfirmWithdraw}
                                options={() => ({
                                    header: () => <ConfirmWithdrawHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="StabilityDepositInitiated"
                                component={StabilityDepositInitiated}
                                options={() => ({
                                    header: () => <DepositInitiatedHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="StabilityWithdrawInitiated"
                                component={StabilityWithdrawInitiated}
                                options={() => ({
                                    header: () => <WithdrawInitiatedHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="StableBalanceIntro"
                                component={StableBalanceIntro}
                                options={() => ({
                                    header: () => <StableBalanceIntroHeader />,
                                })}
                            />
                            {/* Bug report */}
                            <Stack.Screen
                                name="BugReport"
                                component={BugReport}
                                options={() => ({
                                    header: () => <BugReportHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="BugReportSuccess"
                                component={BugReportSuccess}
                                options={{ headerShown: false }}
                            />
                            {isNostrSettingsUnlocked ? (
                                <Stack.Group>
                                    <Stack.Screen
                                        name="NostrSettings"
                                        component={NostrSettings}
                                        options={() => ({
                                            header: () => (
                                                <NostrSettingsHeader />
                                            ),
                                        })}
                                    />
                                </Stack.Group>
                            ) : (
                                <Stack.Group>
                                    <Stack.Screen
                                        name="NostrSettings"
                                        component={NostrSettingsLockScreen}
                                        options={() => ({
                                            header: () => (
                                                <ChangePinLockScreenHeader />
                                            ),
                                        })}
                                    />
                                </Stack.Group>
                            )}
                            {/* Developer-only */}
                            <Stack.Screen
                                name="DeveloperSettings"
                                component={DeveloperSettings}
                                options={() => ({
                                    header: () => (
                                        <Header
                                            backButton
                                            headerCenter={
                                                <Text
                                                    bold
                                                    numberOfLines={1}
                                                    adjustsFontSizeToFit>
                                                    {'Developer Settings'}
                                                </Text>
                                            }
                                        />
                                    ),
                                })}
                            />
                        </Stack.Group>
                        {/* Put all Overlay/Modal screens here */}
                        <Stack.Group>
                            <Stack.Screen
                                name="SocialRecoveryQrModal"
                                component={SocialRecoveryQrModal}
                                options={{
                                    presentation: 'transparentModal',
                                    headerShown: false,
                                }}
                            />
                        </Stack.Group>
                    </Stack.Group>
                ) : (
                    <Stack.Group
                        screenOptions={{
                            animation: 'fade',
                            animationDuration: 250,
                        }}>
                        <Stack.Screen
                            name="LockScreen"
                            component={LockScreen}
                            options={{
                                header: () => <UnlockAppLockScreenHeader />,
                            }}
                        />
                        <Stack.Screen
                            name="ResetPinStart"
                            component={ResetPinStart}
                            options={{
                                header: () => <ResetPinStartHeader />,
                            }}
                        />
                        <Stack.Screen
                            name="ResetPin"
                            component={ResetPin}
                            options={{
                                header: () => <ResetPinHeader />,
                            }}
                        />
                    </Stack.Group>
                )}
            </>
        </Stack.Navigator>
    )
}
