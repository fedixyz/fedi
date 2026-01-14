import { useNavigation } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Text } from '@rneui/themed'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { selectSocialRecoveryState } from '@fedi/common/redux'

import ChooseBackupMethodHeader from '../components/feature/backup/ChooseBackupMethodHeader'
import SocialBackupHeader from '../components/feature/backup/SocialBackupHeader'
import ChatConversationHeader from '../components/feature/chat/ChatConversationHeader'
import ChatConversationSearchHeader from '../components/feature/chat/ChatConversationSearchHeader'
import ChatRoomMembersHeader from '../components/feature/chat/ChatRoomMembersHeader'
import ChatsListSearchHeader from '../components/feature/chat/ChatsListSearchHeader'
import ConfirmJoinPublicGroupHeader from '../components/feature/chat/ConfirmJoinPublicGroupHeader'
import CreatePollHeader from '../components/feature/chat/CreatePollHeader'
import DefaultChatHeader from '../components/feature/chat/DefaultChatHeader'
import CommunityDetailsHeader from '../components/feature/federations/CommunityDetailsHeader'
import CommunityInviteHeader from '../components/feature/federations/CommunityInviteHeader'
import FederationDetailsHeader from '../components/feature/federations/FederationDetailsHeader'
import FederationInviteHeader from '../components/feature/federations/FederationInviteHeader'
import JoinFederationHeader from '../components/feature/federations/JoinFederationHeader'
import AddFediModHeader from '../components/feature/fedimods/AddFediModHeader'
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
import ReceiveBitcoinOfflineHeader from '../components/feature/receive/ReceiveBitcoinOfflineHeader'
import ReceiveCashuHeader from '../components/feature/receive/ReceiveCashuHeader'
import RequestMoneyHeader from '../components/feature/receive/RequestMoneyHeader'
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
import SettingsHeader from '../components/feature/settings/SettingsHeader'
import ConfirmDepositHeader from '../components/feature/stabilitypool/ConfirmDepositHeader'
import ConfirmWithdrawHeader from '../components/feature/stabilitypool/ConfirmWithdrawHeader'
import StabilityHistoryHeader from '../components/feature/stabilitypool/StabilityHistoryHeader'
import StabilityMoveHeader from '../components/feature/stabilitypool/StabilityMoveHeader'
import StabilityTransferHeader from '../components/feature/stabilitypool/StabilityTransferHeader'
import WithdrawInitiatedHeader from '../components/feature/stabilitypool/WithdrawInitiatedHeader'
import HelpCentreHeader from '../components/feature/support/HelpCentreHeader'
import TransactionsHeader from '../components/feature/transaction-history/TransactionsHeader'
import { CenteredHeader } from '../components/ui/CenteredHeader'
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
import AppSettings from './AppSettings'
import AssignMultispendVoters from './AssignMultispendVoters'
import BitcoinRequest from './BitcoinRequest'
import BugReportSuccess from './BugReportSuccess'
import ChatConversationSearch from './ChatConversationSearch'
import ChatImageViewer from './ChatImageViewer'
import ChatRoomConversation from './ChatRoomConversation'
import ChatRoomInvite from './ChatRoomInvite'
import ChatRoomMembers from './ChatRoomMembers'
import ChatUserConversation from './ChatUserConversation'
import ChatVideoViewer from './ChatVideoViewer'
import ChatWallet from './ChatWallet'
import ChatsListSearch from './ChatsListSearch'
import ChooseBackupMethod from './ChooseBackupMethod'
import ChooseRecoveryMethod from './ChooseRecoveryMethod'
import ClaimEcash from './ClaimEcash'
import CommunityDetails from './CommunityDetails'
import CommunityInvite from './CommunityInvite'
import CompleteRecoveryAssist from './CompleteRecoveryAssist'
import CompleteSocialBackup from './CompleteSocialBackup'
import CompleteSocialRecovery from './CompleteSocialRecovery'
import ConfirmJoinPublicGroup from './ConfirmJoinPublicGroup'
import ConfirmReceiveCashu from './ConfirmReceiveCashu'
import ConfirmReceiveOffline from './ConfirmReceiveOffline'
import ConfirmSendChatPayment from './ConfirmSendChatPayment'
import ConfirmSendEcash from './ConfirmSendEcash'
import ConfirmSendLightning from './ConfirmSendLightning'
import ConfirmSendOnChain from './ConfirmSendOnChain'
import CreateGroup from './CreateGroup'
import CreateMultispend from './CreateMultispend'
import CreatePinInstructions from './CreatePinInstructions'
import CreatePoll from './CreatePoll'
import CreatedPin from './CreatedPin'
import DeveloperSettings from './DeveloperSettings'
import EcashSendCancelled from './EcashSendCancelled'
import EditGroup from './EditGroup'
import EditProfileSettings from './EditProfileSettings'
import EnterDisplayName from './EnterDisplayName'
import Eula from './Eula'
import FederationCurrency from './FederationCurrency'
import FederationDetails from './FederationDetails'
import FederationGreeting from './FederationGreeting'
import FederationInvite from './FederationInvite'
import FederationSettings from './FederationSettings'
import FediModBrowser from './FediModBrowser'
import FediModSettings from './FediModSettings'
import GlobalCurrency from './GlobalCurrency'
import GroupMultispend from './GroupMultispend'
import HelpCentre from './HelpCentre'
import Initializing from './Initializing'
import JoinFederation from './JoinFederation'
import LanguageSettings from './LanguageSettings'
import LocateSocialRecovery from './LocateSocialRecovery'
import LockScreen from './LockScreen'
import LockedDevice from './LockedDevice'
import MigratedDevice from './MigratedDevice'
import MigratedDeviceSuccess from './MigratedDeviceSuccess'
import MiniAppPermissionSettings from './MiniAppPermissionSettings'
import MultispendConfirmDeposit from './MultispendConfirmDeposit'
import MultispendConfirmWithdraw from './MultispendConfirmWithdraw'
import MultispendDeposit from './MultispendDeposit'
import MultispendIntro from './MultispendIntro'
import MultispendTransactions from './MultispendTransactions'
import MultispendWithdraw from './MultispendWithdraw'
import NewMessage from './NewMessage'
import NostrSettings from './NostrSettings'
import OmniScanner from './OmniScanner'
import PersonalRecovery from './PersonalRecovery'
import PersonalRecoverySuccess from './PersonalRecoverySuccess'
import PinAccess from './PinAccess'
import PublicCommunities from './PublicCommunities'
import PublicFederations from './PublicFederations'
import Receive from './Receive'
import ReceiveLightning from './ReceiveLightning'
import ReceiveStabilityQr from './ReceiveStabilityQr'
import ReceiveSuccess from './ReceiveSuccess'
import RecordBackupVideo from './RecordBackupVideo'
import RecoverFromNonceReuse from './RecoverFromNonceReuse'
import RecoveryAssistConfirmation from './RecoveryAssistConfirmation'
import RecoveryDeviceSelection from './RecoveryDeviceSelection'
import RecoveryNewWallet from './RecoveryNewWallet'
import RecoveryWalletOptions from './RecoveryWalletOptions'
import RecoveryWalletTransfer from './RecoveryWalletTransfer'
import RecoveryWords from './RecoveryWords'
import RedeemLnurlWithdraw from './RedeemLnurlWithdraw'
import ResetPin from './ResetPin'
import ResetPinStart from './ResetPinStart'
import RoomSettings from './RoomSettings'
import ScanMemberCode from './ScanMemberCode'
import ScanSocialRecoveryCode from './ScanSocialRecoveryCode'
import Send from './Send'
import SendOfflineAmount from './SendOfflineAmount'
import SendOfflineQr from './SendOfflineQr'
import SendOnChainAmount from './SendOnChainAmount'
import SendSuccess from './SendSuccess'
import SendSuccessShield from './SendSuccessShield'
import SetPin from './SetPin'
import Settings from './Settings'
import ShareLogs from './ShareLogs'
import SocialBackupCloudUpload from './SocialBackupCloudUpload'
import SocialBackupProcessing from './SocialBackupProcessing'
import SocialBackupSuccess from './SocialBackupSuccess'
import SocialRecoveryFailure from './SocialRecoveryFailure'
import SocialRecoverySuccess from './SocialRecoverySuccess'
import Splash from './Splash'
import StabilityConfirmDeposit from './StabilityConfirmDeposit'
import StabilityConfirmTransfer from './StabilityConfirmTransfer'
import StabilityConfirmWithdraw from './StabilityConfirmWithdraw'
import StabilityHistory from './StabilityHistory'
import StabilityMove from './StabilityMove'
import StabilityTransfer from './StabilityTransfer'
import StabilityWithdrawInitiated from './StabilityWithdrawInitiated'
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
                freezeOnBlur: true,
            }}
            initialRouteName={'Initializing'}
            id={MAIN_NAVIGATOR_ID}>
            <>
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
                        name="RecoverFromNonceReuse"
                        component={RecoverFromNonceReuse}
                        options={() => ({
                            header: () => <Header backButton />,
                        })}
                    />
                    <Stack.Screen
                        name="PublicFederations"
                        component={PublicFederations}
                        options={({ route }) => ({
                            gestureEnabled: !(route?.params?.from === 'Splash'),
                            fullScreenSwipeEnabled: !(
                                route?.params?.from === 'Splash'
                            ),
                            header: () => (
                                <CenteredHeader
                                    backButton={
                                        route?.params?.from !== 'Splash'
                                    }
                                    title={t('feature.onboarding.heading')}
                                />
                            ),
                        })}
                    />
                    <Stack.Screen
                        name="PublicCommunities"
                        component={PublicCommunities}
                        options={() => ({
                            header: () => (
                                <CenteredHeader
                                    backButton
                                    title={t('phrases.join-a-community')}
                                />
                            ),
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
                        name="HelpCentre"
                        component={HelpCentre}
                        options={{
                            header: () => <HelpCentreHeader />,
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
                        name="MigratedDevice"
                        component={MigratedDevice}
                        options={{ headerShown: false }}
                    />
                    <Stack.Screen
                        name="MigratedDeviceSuccess"
                        component={MigratedDeviceSuccess}
                        options={() => ({
                            header: () => <Header backButton />,
                        })}
                    />
                    <Stack.Screen
                        name="CompleteSocialRecovery"
                        component={CompleteSocialRecovery}
                        options={() => ({
                            header: () => (
                                <SocialRecoveryHeader
                                    backButton
                                    cancelSocialRecovery
                                />
                            ),
                        })}
                    />
                    {/* Deeplink screen */}
                    <Stack.Screen
                        name="ClaimEcash"
                        component={ClaimEcash}
                        options={() => ({
                            header: () => (
                                <CenteredHeader
                                    backButton
                                    title={t('feature.ecash.claim-ecash')}
                                />
                            ),
                        })}
                    />
                </Stack.Group>
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
                            <Stack.Screen
                                name="OmniScanner"
                                component={OmniScanner}
                                options={{
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t('words.scan')}
                                        />
                                    ),
                                }}
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
                                    name="ChatsListSearch"
                                    component={ChatsListSearch}
                                    options={() => ({
                                        header: () => <ChatsListSearchHeader />,
                                    })}
                                />
                                <Stack.Screen
                                    name="ChatConversationSearch"
                                    component={ChatConversationSearch}
                                    options={() => ({
                                        header: () => (
                                            <ChatConversationSearchHeader />
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
                                    options={() => ({
                                        header: () => <ChatRoomMembersHeader />,
                                    })}
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
                                    name="MultispendIntro"
                                    component={MultispendIntro}
                                    options={() => ({
                                        header: () => (
                                            <CenteredHeader
                                                backButton
                                                title={t(
                                                    'feature.multispend.create-multispend',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="CreateMultispend"
                                    component={CreateMultispend}
                                    options={() => ({
                                        header: () => (
                                            <CenteredHeader
                                                backButton
                                                title={t(
                                                    'feature.multispend.create-multispend',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="AssignMultispendVoters"
                                    component={AssignMultispendVoters}
                                    options={() => ({
                                        header: () => (
                                            <CenteredHeader
                                                backButton
                                                title={t(
                                                    'feature.multispend.assign-voters',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="GroupMultispend"
                                    component={GroupMultispend}
                                    options={() => ({
                                        header: () => null,
                                    })}
                                />
                                <Stack.Screen
                                    name="MultispendTransactions"
                                    component={MultispendTransactions}
                                    options={() => ({
                                        header: () => null,
                                    })}
                                />
                                <Stack.Screen
                                    name="MultispendDeposit"
                                    component={MultispendDeposit}
                                    options={() => ({
                                        header: () => (
                                            <CenteredHeader
                                                backButton
                                                title={t(
                                                    'feature.multispend.deposit-to-multispend',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="MultispendConfirmDeposit"
                                    component={MultispendConfirmDeposit}
                                    options={() => ({
                                        header: () => (
                                            <CenteredHeader
                                                backButton
                                                title={t(
                                                    'feature.multispend.confirm-transaction',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="MultispendWithdraw"
                                    component={MultispendWithdraw}
                                    options={() => ({
                                        header: () => (
                                            <CenteredHeader
                                                backButton
                                                title={t(
                                                    'feature.multispend.withdraw-from-multispend',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="MultispendConfirmWithdraw"
                                    component={MultispendConfirmWithdraw}
                                    options={() => ({
                                        header: () => (
                                            <CenteredHeader
                                                backButton
                                                title={t(
                                                    'feature.multispend.confirm-transaction',
                                                )}
                                            />
                                        ),
                                    })}
                                />

                                <Stack.Screen
                                    name="ChatWallet"
                                    component={ChatWallet}
                                    options={() => ({
                                        header: () => (
                                            <CenteredHeader
                                                backButton
                                                title={t(
                                                    'feature.chat.request-or-send-money',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="ConfirmSendChatPayment"
                                    component={ConfirmSendChatPayment}
                                    options={() => ({
                                        header: () => (
                                            <DefaultChatHeader
                                                title={t(
                                                    'feature.multispend.confirm-transaction',
                                                )}
                                            />
                                        ),
                                    })}
                                />
                                <Stack.Screen
                                    name="ChatImageViewer"
                                    component={ChatImageViewer}
                                    options={() => ({ headerShown: false })}
                                />
                                <Stack.Screen
                                    name="ChatVideoViewer"
                                    component={ChatVideoViewer}
                                    options={() => ({ headerShown: false })}
                                />
                                <Stack.Screen
                                    name="CreatePoll"
                                    component={CreatePoll}
                                    options={() => ({
                                        header: () => <CreatePollHeader />,
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
                            <Stack.Screen
                                name="SendSuccessShield"
                                component={SendSuccessShield}
                                options={{ headerShown: false }}
                            />
                            <Stack.Screen
                                name="EcashSendCancelled"
                                component={EcashSendCancelled}
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
                                    header: () => <RequestMoneyHeader />,
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
                                    header: () => <RequestMoneyHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="RedeemLnurlWithdraw"
                                component={RedeemLnurlWithdraw}
                                options={() => ({
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t(
                                                'feature.receive.redeem-lnurl-withdraw',
                                            )}
                                        />
                                    ),
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
                            <Stack.Screen
                                name="CommunityInvite"
                                component={CommunityInvite}
                                options={() => ({
                                    header: () => <CommunityInviteHeader />,
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
                                name="ScanSocialRecoveryCode"
                                component={ScanSocialRecoveryCode}
                                options={() => ({
                                    header: () => (
                                        <RecoveryAssistHeader backButton />
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
                                name="RecoveryAssistConfirmation"
                                component={RecoveryAssistConfirmation}
                                options={{ headerShown: false }}
                            />
                            {/* Personal Backup */}
                            <Stack.Screen
                                name="RecoveryWords"
                                component={RecoveryWords}
                                options={() => ({
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t(
                                                'feature.backup.personal-backup',
                                            )}
                                        />
                                    ),
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
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t(
                                                'feature.fedimods.fedi-mods',
                                            )}
                                        />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="MiniAppPermissionSettings"
                                component={MiniAppPermissionSettings}
                                options={() => ({
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t(
                                                'feature.settings.mini-app-permission-settings',
                                            )}
                                        />
                                    ),
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
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t('phrases.edit-profile')}
                                        />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="LanguageSettings"
                                component={LanguageSettings}
                                options={() => ({
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t('words.language')}
                                        />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="FederationCurrency"
                                component={FederationCurrency}
                                options={() => ({
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t(
                                                'phrases.select-local-currency',
                                            )}
                                        />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="GlobalCurrency"
                                component={GlobalCurrency}
                                options={() => ({
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t(
                                                'phrases.select-global-currency',
                                            )}
                                        />
                                    ),
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
                                name="AppSettings"
                                component={AppSettings}
                                options={() => ({
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t(
                                                'feature.settings.app-settings',
                                            )}
                                        />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="FederationSettings"
                                component={FederationSettings}
                                options={() => ({
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t(
                                                'feature.settings.federation-settings',
                                            )}
                                        />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="FederationDetails"
                                component={FederationDetails}
                                options={() => ({
                                    header: () => <FederationDetailsHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="CommunityDetails"
                                component={CommunityDetails}
                                options={() => ({
                                    header: () => <CommunityDetailsHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="FederationModSettings"
                                component={FediModSettings}
                                options={() => ({
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t(
                                                'feature.federations.federation-mods',
                                            )}
                                        />
                                    ),
                                })}
                            />
                            {/* Stability Pools */}
                            <Stack.Screen
                                name="StabilityHistory"
                                component={StabilityHistory}
                                options={() => ({
                                    header: () => <StabilityHistoryHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="StabilityMove"
                                component={StabilityMove}
                                options={() => ({
                                    header: () => <StabilityMoveHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="StabilityTransfer"
                                component={StabilityTransfer}
                                options={() => ({
                                    header: () => <StabilityTransferHeader />,
                                })}
                            />
                            <Stack.Screen
                                name="StabilityConfirmTransfer"
                                component={StabilityConfirmTransfer}
                                options={() => ({
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t(
                                                'feature.stabilitypool.confirm-transfer',
                                            )}
                                        />
                                    ),
                                })}
                            />
                            <Stack.Screen
                                name="ReceiveStabilityQr"
                                component={ReceiveStabilityQr}
                                options={() => ({
                                    header: () => (
                                        <CenteredHeader
                                            title={t(
                                                'feature.stabilitypool.receive-stable-balance',
                                            )}
                                            backButton
                                        />
                                    ),
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
                                name="StabilityWithdrawInitiated"
                                component={StabilityWithdrawInitiated}
                                options={() => ({
                                    header: () => <WithdrawInitiatedHeader />,
                                })}
                            />
                            {/* Share Logs */}
                            <Stack.Screen
                                name="ShareLogs"
                                component={ShareLogs}
                                options={() => ({
                                    header: () => (
                                        <CenteredHeader
                                            backButton
                                            title={t(
                                                'feature.developer.share-logs',
                                            )}
                                        />
                                    ),
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
                        {/* Put all Overlay/Modal screens inside the Stack.Group */}
                        {/* <Stack.Group> */}
                        {/* </Stack.Group> */}
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
