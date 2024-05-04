import React, { useState } from 'react'

import alarmIcon from '@fedi/common/assets/svgs/alarm.svg'
import arrowLeftIcon from '@fedi/common/assets/svgs/arrow-left.svg'
import bitcoinIcon from '@fedi/common/assets/svgs/bitcoin.svg'
import boltIcon from '@fedi/common/assets/svgs/bolt.svg'
import cashIcon from '@fedi/common/assets/svgs/cash.svg'
import chatHistoryIcon from '@fedi/common/assets/svgs/chat-history.svg'
import chatIcon from '@fedi/common/assets/svgs/chat.svg'
import checkIcon from '@fedi/common/assets/svgs/check.svg'
import chevronLeftIcon from '@fedi/common/assets/svgs/chevron-left.svg'
import chevronRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import clipboardIcon from '@fedi/common/assets/svgs/clipboard.svg'
import closeIcon from '@fedi/common/assets/svgs/close.svg'
import cogIcon from '@fedi/common/assets/svgs/cog.svg'
import copyIcon from '@fedi/common/assets/svgs/copy.svg'
import editIcon from '@fedi/common/assets/svgs/edit.svg'
import errorIcon from '@fedi/common/assets/svgs/error.svg'
import federationIcon from '@fedi/common/assets/svgs/federation.svg'
import fediFileIcon from '@fedi/common/assets/svgs/fedi-file.svg'
import fediLogoIcon from '@fedi/common/assets/svgs/fedi-logo-icon.svg'
import globeIcon from '@fedi/common/assets/svgs/globe.svg'
import googleDriveIcon from '@fedi/common/assets/svgs/google-drive.svg'
import homeIcon from '@fedi/common/assets/svgs/home.svg'
import inviteMembersIcon from '@fedi/common/assets/svgs/invite-members.svg'
import keyboardIcon from '@fedi/common/assets/svgs/keyboard.svg'
import leaveFederationIcon from '@fedi/common/assets/svgs/leave-federation.svg'
import leaveRoomIcon from '@fedi/common/assets/svgs/leave-room.svg'
import listIcon from '@fedi/common/assets/svgs/list.svg'
import noteIcon from '@fedi/common/assets/svgs/note.svg'
import offlineIcon from '@fedi/common/assets/svgs/offline.svg'
import phoneIcon from '@fedi/common/assets/svgs/phone.svg'
import photoIcon from '@fedi/common/assets/svgs/photo.svg'
import pinIcon from '@fedi/common/assets/svgs/pin.svg'
import playIcon from '@fedi/common/assets/svgs/play.svg'
import plusIcon from '@fedi/common/assets/svgs/plus.svg'
import qrIcon from '@fedi/common/assets/svgs/qr.svg'
import recoveryIcon from '@fedi/common/assets/svgs/recovery.svg'
import roomIcon from '@fedi/common/assets/svgs/room.svg'
import scanSadIcon from '@fedi/common/assets/svgs/scan-sad.svg'
import scanIcon from '@fedi/common/assets/svgs/scan.svg'
import searchIcon from '@fedi/common/assets/svgs/search.svg'
import sendArrowUpCircleIcon from '@fedi/common/assets/svgs/send-arrow-up-circle.svg'
import socialPeopleIcon from '@fedi/common/assets/svgs/social-people.svg'
import speakerphoneIcon from '@fedi/common/assets/svgs/speakerphone.svg'
import switchLeftIcon from '@fedi/common/assets/svgs/switch-left.svg'
import switchRightIcon from '@fedi/common/assets/svgs/switch-right.svg'
import uploadIcon from '@fedi/common/assets/svgs/upload.svg'
import videoIcon from '@fedi/common/assets/svgs/video.svg'
import walletIcon from '@fedi/common/assets/svgs/wallet.svg'
import wordListIcon from '@fedi/common/assets/svgs/word-list.svg'

import { styled } from '../../styles'
import { Icon } from '../Icon'

const icons = [
    { name: 'alarm', icon: alarmIcon },
    { name: 'arrowLeft', icon: arrowLeftIcon },
    { name: 'bitcoin', icon: bitcoinIcon },
    { name: 'bolt', icon: boltIcon },
    { name: 'cash', icon: cashIcon },
    { name: 'chatHistory', icon: chatHistoryIcon },
    { name: 'chat', icon: chatIcon },
    { name: 'check', icon: checkIcon },
    { name: 'chevronLeft', icon: chevronLeftIcon },
    { name: 'chevronRight', icon: chevronRightIcon },
    { name: 'clipboard', icon: clipboardIcon },
    { name: 'close', icon: closeIcon },
    { name: 'cog', icon: cogIcon },
    { name: 'copy', icon: copyIcon },
    { name: 'edit', icon: editIcon },
    { name: 'error', icon: errorIcon },
    { name: 'federation', icon: federationIcon },
    { name: 'fediFile', icon: fediFileIcon },
    { name: 'fediLogo', icon: fediLogoIcon },
    { name: 'globe', icon: globeIcon },
    { name: 'googleDrive', icon: googleDriveIcon },
    { name: 'home', icon: homeIcon },
    { name: 'inviteMembers', icon: inviteMembersIcon },
    { name: 'keyboard', icon: keyboardIcon },
    { name: 'leaveFederation', icon: leaveFederationIcon },
    { name: 'leaveRoom', icon: leaveRoomIcon },
    { name: 'list', icon: listIcon },
    { name: 'note', icon: noteIcon },
    { name: 'offline', icon: offlineIcon },
    { name: 'phone', icon: phoneIcon },
    { name: 'photo', icon: photoIcon },
    { name: 'pin', icon: pinIcon },
    { name: 'play', icon: playIcon },
    { name: 'plus', icon: plusIcon },
    { name: 'qr', icon: qrIcon },
    { name: 'recovery', icon: recoveryIcon },
    { name: 'room', icon: roomIcon },
    { name: 'scanSad', icon: scanSadIcon },
    { name: 'scan', icon: scanIcon },
    { name: 'search', icon: searchIcon },
    { name: 'sendArrowUpCircle', icon: sendArrowUpCircleIcon },
    { name: 'socialPeople', icon: socialPeopleIcon },
    { name: 'speakerphone', icon: speakerphoneIcon },
    { name: 'switchLeft', icon: switchLeftIcon },
    { name: 'switchRight', icon: switchRightIcon },
    { name: 'upload', icon: uploadIcon },
    { name: 'video', icon: videoIcon },
    { name: 'wallet', icon: walletIcon },
    { name: 'wordList', icon: wordListIcon },
]

const sizeOptions = ['xs', 'sm', 'md', 'lg', 'xl'] as const

export const IconDemo: React.FC = () => {
    const [size, setSize] = useState<(typeof sizeOptions)[number]>('md')
    const [color, setColor] = useState<string>()

    return (
        <div>
            <SizeOptions>
                {sizeOptions.map(sizeOpt => (
                    <SizeRadio key={sizeOpt}>
                        <input
                            type="radio"
                            checked={size === sizeOpt}
                            value={sizeOpt}
                            onChange={() => setSize(sizeOpt)}
                        />
                        <div>{sizeOpt}</div>
                    </SizeRadio>
                ))}
                <input
                    type="color"
                    onChange={ev => setColor(ev.currentTarget.value)}
                />
            </SizeOptions>
            {icons.map(({ name, icon }) => (
                <IconContainer key={name} style={{ color }}>
                    <Icon icon={icon} size={size} />
                    <IconLabel>{name}</IconLabel>
                </IconContainer>
            ))}
        </div>
    )
}

const SizeOptions = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 20,
})

const SizeRadio = styled('label', {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
})

const IconContainer = styled('div', {
    display: 'inline-flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    width: 104,
    height: 120,
})

const IconLabel = styled('div', {
    fontSize: 12,
    marginTop: 10,
})
