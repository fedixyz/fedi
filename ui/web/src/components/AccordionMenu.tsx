import { ReactNode, useState } from 'react'

import ChevronDownIcon from '@fedi/common/assets/svgs/chevron-down.svg'

import { styled, theme } from '../styles'
import { MenuGroup, SettingsMenu } from './SettingsMenu'

interface AccordionMenuProps {
    header: ReactNode
    menu: MenuGroup
}

export const AccordionMenu = ({ header, menu }: AccordionMenuProps) => {
    const [isExpanded, setIsExpanded] = useState(false)

    return (
        <AccordionContainer>
            <AccordionHeader
                onClick={() => setIsExpanded(!isExpanded)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setIsExpanded(!isExpanded)
                    }
                }}>
                <HeaderContent>
                    {header}
                    <ChevronIcon
                        style={{
                            transform: isExpanded
                                ? 'rotate(-180deg)'
                                : 'rotate(0deg)',
                        }}>
                        <ChevronDownIcon width={20} height={20} />
                    </ChevronIcon>
                </HeaderContent>
            </AccordionHeader>

            {isExpanded && (
                <MenuContent>
                    <SettingsMenu menu={[menu]} />
                </MenuContent>
            )}
        </AccordionContainer>
    )
}

const AccordionContainer = styled('div', {
    backgroundColor: theme.colors.offWhite100,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
})

const AccordionHeader = styled('button', {
    width: '100%',
    padding: 16,
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
})

const HeaderContent = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
})

const ChevronIcon = styled('div', {
    transition: 'transform 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.grey,
})

const MenuContent = styled('div', {
    paddingTop: 0,
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 16,
})

export const MenuItemInfo = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
})

export const MenuItemName = styled('span', {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.darkGrey,
})
