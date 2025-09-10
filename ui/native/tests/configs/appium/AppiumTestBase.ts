/* eslint-disable no-console */
import { ChainablePromiseArray, ChainablePromiseElement } from 'webdriverio'

import AppiumManager from './AppiumManager'
import {
    LocatorStrategy,
    Percentage,
    Platform,
    ScrollCoordinates,
    ScrollDirection,
    ScrollOptions,
    currentPlatform,
} from './types'

const DEFAULT_SCROLL_OPTIONS: Required<ScrollOptions> = {
    maxScrolls: 10,
    scrollDirection: 'down',
    scrollDuration: 100,
    scrollPercentage: 10,
}

export const DEFAULT_TIMEOUT = 20000

export abstract class AppiumTestBase {
    protected driver: WebdriverIO.Browser

    /*constructor() {
    this.driver = null;
  }*/

    async initialize(): Promise<void> {
        const appiumManager = AppiumManager.getInstance()
        this.driver = await appiumManager.setup()
    }

    getElementLocatorStrategies(key: string): LocatorStrategy[] {
        switch (currentPlatform) {
            case Platform.ANDROID:
                return [
                    {
                        selector: `accessibility id:${key}`,
                        priority: 1,
                        description: 'Accessibility ID',
                    },
                    {
                        selector: `android=new UiSelector().resourceId("${key}")`,
                        priority: 2,
                        description: 'Resource ID',
                    },
                ]
            case Platform.IOS:
                return [
                    {
                        selector: `accessibility id:${key}`,
                        priority: 1,
                        description: 'Accessibility ID',
                    },
                    {
                        selector: `id:${key}`,
                        priority: 2,
                        description: 'Element ID',
                    },
                ]
            default:
                throw new Error(
                    "PWA element locator strategies haven't been implemented yet.",
                )
        }
    }

    async findElementByKey(
        key: string,
    ): Promise<ChainablePromiseElement | null> {
        const strategies = this.getElementLocatorStrategies(key).sort(
            (a, b) => a.priority - b.priority,
        )
        const primaryStrategy = strategies[0]
        const errors: string[] = []

        for (const strategy of strategies) {
            try {
                console.log(
                    `Trying to find element with strategy: ${strategy.description}`,
                )
                const element = await this.driver.$(strategy.selector)

                if (await element.isExisting()) {
                    console.log(
                        `Element found with strategy: ${strategy.description}`,
                    )
                    return element
                } else {
                    const msg = `Element not found with strategy: ${strategy.description}`
                    console.log(msg)
                    errors.push(msg)
                }
            } catch (error: unknown) {
                const msg = `Strategy ${strategy.description} failed: ${(error as Error).message}`
                console.log(msg)
                errors.push(msg)
            }
        }
        console.log(
            `All strategies failed, trying the primary strategy once more:`,
        )
        try {
            const element = await this.driver.$(primaryStrategy.selector)

            if (await element.isExisting()) {
                console.log(
                    `Element found with primary strategy ${primaryStrategy.description} after the strategy failed the first time.`,
                )
                return element
            }
        } catch (error: unknown) {
            console.log(
                `A repeat atttempt with primary strategy ${primaryStrategy.description} failed: ${(error as Error).message}. Element most likely does not exist in XML tree. Try dumping it.`,
            )
        }
        console.log(
            `Element with key "${key}" not found after trying all strategies:`,
        )
        errors.forEach((err, index) => console.log(`  ${index + 1}. ${err}`))

        return null
    }

    getTextLocatorStrategies(
        text: string,
        exactMatch: boolean,
    ): LocatorStrategy[] {
        switch (currentPlatform) {
            case Platform.ANDROID:
                if (exactMatch === true) {
                    return [
                        {
                            selector: `android=new UiSelector().text("${text}")`,
                            priority: 1,
                            description: 'Exact text match',
                        },
                        {
                            selector: `android=new UiSelector().description("${text}")`,
                            priority: 2,
                            description: 'Exact content description',
                        },
                    ]
                } else {
                    return [
                        {
                            selector: `android=new UiSelector().textContains("${text}")`,
                            priority: 1,
                            description: 'Partial text match',
                        },
                        {
                            selector: `android=new UiSelector().descriptionContains("${text}")`,
                            priority: 2,
                            description: 'Partial content description',
                        },
                    ]
                }
            case Platform.IOS:
                if (exactMatch === true) {
                    return [
                        {
                            selector: `-ios predicate string:label == "${text}" OR name == "${text}" OR value == "${text}"`,
                            priority: 1,
                            description: 'Predicate string (fast)',
                        },
                        {
                            selector: `-ios class chain:**/*[@label="${text}" or @name="${text}" or @value="${text}"]`,
                            priority: 2,
                            description: 'Class chain (accurate)',
                        },
                        {
                            selector: `//XCUIElementTypeStaticText[@value="${text}"]`,
                            priority: 3,
                            description: 'XPath (slow)',
                        },
                    ]
                } else {
                    return [
                        {
                            selector: `-ios predicate string:label CONTAINS "${text}" OR name CONTAINS "${text}" OR value CONTAINS "${text}"`,
                            priority: 1,
                            description: 'Predicate contains',
                        },
                        {
                            selector: `-ios class chain:**/*[contains(@label, "${text}") or contains(@name, "${text}") or contains(@value, "${text}")]`,
                            priority: 2,
                            description: 'Class chain contains',
                        },
                        {
                            selector: `//XCUIElementTypeStaticText[contains(@value, "${text}")]`,
                            priority: 3,
                            description: 'XPath contains (slow)',
                        },
                    ]
                }
            default:
                throw new Error(
                    "PWA text locator strategies haven't been implemented yet.",
                )
        }
    }

    async findElementsByText(
        text: string,
        exactMatch = false,
        timeout = DEFAULT_TIMEOUT,
    ): Promise<ChainablePromiseArray> {
        const startTime = Date.now()
        let elements
        const strategies = this.getTextLocatorStrategies(text, exactMatch).sort(
            (a, b) => a.priority - b.priority,
        )
        const errors: string[] = []

        while (Date.now() - startTime < timeout) {
            for (const strategy of strategies) {
                try {
                    elements = await this.driver
                        .$$(strategy.selector)
                        .filter(el => el.isDisplayed())
                    if (elements.length > 0) {
                        return this.driver.$$(elements)
                    }
                } catch (error) {
                    const msg = `No elements found using ${strategy.description}. ${(error as Error).message}.`
                    console.log(msg)
                    errors.push(msg)
                }
                await new Promise(resolve => setTimeout(resolve, 500))
            }
        }
        console.log(
            `No elements with ${text} in them were found. If this is not intentional, check the XML tree dump or reproduce the test in Appium Inspector to find out why.`,
        )
        errors.forEach((err, index) => console.log(`  ${index + 1}. ${err}`))
        return this.driver.$$([])
    }

    async findElementByText(
        text: string,
        instanceNum: number,
        exactMatch = false,
        timeout = DEFAULT_TIMEOUT,
    ): Promise<ChainablePromiseElement | null> {
        const elements = await this.findElementsByText(
            text,
            exactMatch,
            timeout,
        )

        if ((await elements.length) === 0) {
            return null
        }

        if (instanceNum < 0) {
            const actualIndex = (await elements.length) + instanceNum
            if (actualIndex >= 0) {
                return elements[actualIndex]
            }
            return null
        }

        if (instanceNum >= 0 && instanceNum < (await elements.length)) {
            return elements[instanceNum]
        }

        return null
    }

    async isTextPresent(
        text: string,
        exactMatch = false,
        timeout = DEFAULT_TIMEOUT,
    ): Promise<boolean> {
        const elements = await this.findElementsByText(
            text,
            exactMatch,
            timeout,
        )
        return (await elements.length) > 0
    }

    async waitForText(
        text: string,
        instanceNum: number,
        exactMatch = false,
        timeout = DEFAULT_TIMEOUT,
    ): Promise<ChainablePromiseElement> {
        const element = await this.findElementByText(
            text,
            instanceNum,
            exactMatch,
            timeout,
        )
        if (!element) {
            throw new Error(
                `Text "${text}" (instance ${instanceNum}) not found on screen within ${timeout}ms`,
            )
        }
        return element
    }

    async clickOnText(
        text: string,
        instanceNum: number,
        exactMatch = false,
        timeout = DEFAULT_TIMEOUT,
    ): Promise<void> {
        const element = await this.waitForText(
            text,
            instanceNum,
            exactMatch,
            timeout,
        )
        await element.click()
    }

    async getTextInstanceCount(
        text: string,
        exactMatch = false,
        timeout = DEFAULT_TIMEOUT,
    ): Promise<number> {
        const elements = await this.findElementsByText(
            text,
            exactMatch,
            timeout,
        )
        return elements.length
    }

    private async isElementVisible(
        element: ChainablePromiseElement | null,
    ): Promise<boolean> {
        return element !== null && (await element.isDisplayed())
    }

    async waitForElementDisplayed(
        key: string,
        timeout = DEFAULT_TIMEOUT,
    ): Promise<ChainablePromiseElement> {
        const startTime = Date.now()
        const errors: Error[] = []

        while (Date.now() - startTime < timeout) {
            try {
                const element = await this.findElementByKey(key)

                if (await this.isElementVisible(element)) {
                    return element as ChainablePromiseElement
                }
            } catch (error) {
                errors.push(error as Error)
            }

            await new Promise(resolve => setTimeout(resolve, 500))
        }
        throw new Error(
            `Element with key "${key}" not displayed after ${timeout}ms. Errors: ${errors.map(e => e.message).join('; ')}`,
        )
    }

    async clickElementByKey(
        key: string,
        timeout = DEFAULT_TIMEOUT,
    ): Promise<void> {
        console.log(`Attempting to click element: ${key}`)
        const element = await this.waitForElementDisplayed(key, timeout)

        const startTime = Date.now()
        while (Date.now() - startTime < timeout) {
            if (await this.isElementClickable(element)) {
                await element.click()
                console.log(`Successfully clicked element: ${key}`)
                return
            }
            await new Promise(resolve => setTimeout(resolve, 100))
        }

        throw new Error(
            `Element "${key}" was displayed but not clickable after ${timeout} ms`,
        )
    }

    async clickAndCheckForNextElement(
        keyOfElementToClick: string,
        keyOfElementToCheck: string,
        timeout = DEFAULT_TIMEOUT,
        retryDelay = 500,
    ): Promise<void> {
        console.log(
            `Clicking "${keyOfElementToClick}" until "${keyOfElementToCheck}" is displayed`,
        )
        const startTime = Date.now()
        let attempts = 0
        let targetFound = false

        while (Date.now() - startTime < timeout && !targetFound) {
            attempts++
            console.log(`Attempt ${attempts}`)

            try {
                await this.clickElementByKey(keyOfElementToClick, 1000)
            } catch (error) {
                console.warn(
                    `Clicking element ${keyOfElementToClick} failed: ${(error as Error).message}`,
                )
            }

            targetFound = await this.elementIsDisplayed(
                keyOfElementToCheck,
                1000,
            )

            if (targetFound) {
                console.log(
                    `Success! Target element "${keyOfElementToCheck}" is displayed after ${attempts} attempt(s)`,
                )
            } else {
                const remainingTime = timeout - (Date.now() - startTime)
                if (remainingTime <= retryDelay) break

                await new Promise(resolve => setTimeout(resolve, retryDelay))
            }
        }

        if (!targetFound) {
            throw new Error(
                `Element ${keyOfElementToCheck} was not displayed after clicking ${keyOfElementToClick} ${attempts} times`,
            )
        }
    }

    async typeIntoElementByKey(
        key: string,
        text: string,
        timeout = DEFAULT_TIMEOUT,
    ): Promise<void> {
        console.log(`Attempting to type into element: ${key}`)
        const element = await this.waitForElementDisplayed(key, timeout)
        await element.setValue(text)
        console.log(`Successfully typed into element: ${key}`)
    }

    async elementIsDisplayed(
        key: string,
        timeout = DEFAULT_TIMEOUT,
    ): Promise<boolean> {
        try {
            await this.waitForElementDisplayed(key, timeout)
            return true
        } catch (error: unknown) {
            console.log(
                `Element ${key} is not displayed: ${(error as Error).message}`,
            )
            return false
        }
    }

    private async isElementClickable(
        element: ChainablePromiseElement,
    ): Promise<boolean> {
        let attr
        switch (currentPlatform) {
            case Platform.ANDROID:
                attr = await element.getAttribute('clickable')
                return attr === 'true'

            case Platform.IOS:
                attr = await element.getAttribute('hittable')
                return attr === 'true'

            case Platform.PWA:
                return await element.isClickable()
        }
    }

    private async getScrollCoordinates(
        scrollDirection: ScrollDirection,
        scrollPercentage: Percentage,
    ): Promise<ScrollCoordinates> {
        const { width, height } = await this.driver.getWindowSize()
        const margin = (1 - scrollPercentage / 100) / 2

        const coordinatesMap: Record<ScrollDirection, ScrollCoordinates> = {
            down: {
                startX: width / 2,
                startY: height * (1 - margin),
                endX: width / 2,
                endY: height * margin,
            },
            up: {
                startX: width / 2,
                startY: height * margin,
                endX: width / 2,
                endY: height * (1 - margin),
            },
            left: {
                startX: width * margin,
                startY: height / 2,
                endX: width * (1 - margin),
                endY: height / 2,
            },
            right: {
                startX: width * (1 - margin),
                startY: height / 2,
                endX: width * margin,
                endY: height / 2,
            },
        }

        return coordinatesMap[scrollDirection]
    }

    private createScrollActions(
        coordinates: ScrollCoordinates,
        duration: number,
    ): any[] {
        const { startX, startY, endX, endY } = coordinates

        return [
            {
                type: 'pointer',
                id: 'finger1',
                parameters: { pointerType: 'touch' },
                actions: [
                    {
                        type: 'pointerMove',
                        duration: 0,
                        x: Math.round(startX),
                        y: Math.round(startY),
                    },
                    {
                        type: 'pointerDown',
                        button: 0,
                    },
                    {
                        type: 'pointerMove',
                        duration,
                        x: Math.round(endX),
                        y: Math.round(endY),
                    },
                    {
                        type: 'pointerUp',
                        button: 0,
                    },
                ],
            },
        ]
    }

    async scroll(
        scrollDirection: ScrollDirection,
        scrollDuration = 1000,
        scrollPercentage: Percentage,
    ): Promise<void> {
        try {
            const coordinates = await this.getScrollCoordinates(
                scrollDirection,
                scrollPercentage,
            )

            const actions = this.createScrollActions(
                coordinates,
                scrollDuration,
            )
            await this.driver.performActions(actions)
            await this.driver.releaseActions()

            // Wait for scroll animation to complete
            await this.driver.pause(scrollDuration * 2)
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error'
            throw new Error(`Scroll action failed: ${errorMessage}`)
        }
    }

    private async scrollUntilFound(
        findElementFn: () => Promise<ChainablePromiseElement | null>,
        elementDescription: string,
        options: ScrollOptions = {},
    ): Promise<ChainablePromiseElement | null> {
        const config = { ...DEFAULT_SCROLL_OPTIONS, ...options }
        const {
            maxScrolls,
            scrollDirection,
            scrollDuration,
            scrollPercentage,
        } = config

        // Check if element is already visible
        let element = await findElementFn()
        if (await this.isElementVisible(element)) {
            console.log(`Element ${elementDescription} is already visible`)
            return element
        }

        console.log(
            `Starting W3C Actions scroll search for element ${elementDescription}`,
        )

        // Perform scroll attempts
        for (let i = 0; i < maxScrolls; i++) {
            try {
                await this.scroll(
                    scrollDirection,
                    scrollDuration,
                    scrollPercentage,
                )

                element = await findElementFn()
                if (await this.isElementVisible(element)) {
                    console.log(
                        `Element found and visible after ${i + 1} scroll(s)`,
                    )
                    return element
                }
            } catch (error) {
                console.error(
                    `Scroll attempt ${i + 1} in direction ${scrollDirection} failed:`,
                    error instanceof Error ? error.message : error,
                )
                // Continue to next attempt
            }
        }

        console.log(
            `Element ${elementDescription} not found after ${maxScrolls} scroll attempts`,
        )
        return null
    }
    /**
     * scrollOptions sets options to control scroll helper functions. e.g. scrollOptions: {param1, param2...}
     * @param maxScrolls How many scrolls to perform within the functions.
     * @param scrollDirection Tells the functions the direction to scroll in.
     * @param scrollDuration Duration of the scroll in milliseconds. A smaller duration usually means a stronger scroll.
     * @param scrollPercentage How far down the screen to scroll. Accepted values are from 1 to 100.
     */
    async scrollToElement(
        key: string,
        scrollOptions: ScrollOptions = {},
    ): Promise<ChainablePromiseElement | null> {
        return this.scrollUntilFound(
            () => this.findElementByKey(key),
            `with key "${key}"`,
            scrollOptions,
        )
    }

    async scrollToText(
        text: string,
        instanceNum = 1,
        exactMatch = false,
        timeout?: number,
        scrollOptions: ScrollOptions = {},
    ): Promise<ChainablePromiseElement | null> {
        return this.scrollUntilFound(
            () =>
                this.findElementByText(text, instanceNum, exactMatch, timeout),
            `with text "${text}"`,
            scrollOptions,
        )
    }

    async dismissKeyboard(): Promise<void> {
        try {
            await this.driver.executeScript('mobile: isKeyboardShown', [])
            await this.driver.executeScript('mobile: hideKeyboard', [
                { keys: ['done', 'gotowe'] },
            ])
        } catch (error: unknown) {
            console.log(
                `Unable to hide keyboard. Reason: ${(error as Error).message}`,
            )
        }
    }

    async acceptAlert(button: string): Promise<void> {
        switch (currentPlatform) {
            case Platform.ANDROID:
                try {
                    await this.driver.executeScript('mobile: acceptAlert', [
                        { buttonLabel: button },
                    ])
                } catch (error: unknown) {
                    console.log(
                        `Unable to accept alert with buttonLabel ${button} on Android. Reason: ${(error as Error).message}. Trying to infer the allow button`,
                    )
                    await this.driver.executeScript('mobile: acceptAlert', [])
                }
                break
            case Platform.IOS:
                try {
                    let retryCount = 0
                    let alertButtons
                    do {
                        try {
                            alertButtons = await this.driver.executeScript(
                                'mobile: alert',
                                [{ action: 'getButtons' }],
                            )
                        } catch (error) {
                            console.log(
                                'Got an error trying to fetch alert buttons',
                            )
                            alertButtons = null
                        }
                        if (alertButtons && alertButtons.length > 0) {
                            await this.driver.executeScript('mobile: alert', [
                                { action: 'accept', buttonLabel: button },
                            ])
                        }
                        retryCount++
                    } while (alertButtons && retryCount < 5)
                } catch (error: unknown) {
                    console.log(
                        `Unable to accept alert with buttonLabel ${button} on iOS. Reason: ${(error as Error).message}. Trying to infer the allow button`,
                    )
                    await this.driver.executeScript('mobile: alert', [
                        { action: 'accept' },
                    ])
                }
                break
            default:
                console.log(
                    `Platform is PWA, and it is ${currentPlatform}, no alerts to accept`,
                )
        }
    }

    async dismissAlert(button: string): Promise<void> {
        switch (currentPlatform) {
            case Platform.ANDROID:
                try {
                    await this.driver.executeScript('mobile: dismissAlert', [
                        { buttonLabel: button },
                    ])
                } catch (error: unknown) {
                    console.log(
                        `Unable to dismiss alert with buttonLabel ${button} on Android. Reason: ${(error as Error).message}. Trying to infer the dismiss button`,
                    )
                    await this.driver.executeScript('mobile: dismissAlert', [])
                }
                break
            case Platform.IOS:
                try {
                    let retryCount = 0
                    let alertButtons
                    do {
                        try {
                            alertButtons = await this.driver.executeScript(
                                'mobile: alert',
                                [{ action: 'getButtons' }],
                            )
                        } catch (error) {
                            console.log(
                                'Got an error trying to fetch alert buttons',
                            )
                            alertButtons = null
                        }
                        if (alertButtons && alertButtons.length > 0) {
                            await this.driver.executeScript('mobile: alert', [
                                { action: 'dismiss', buttonLabel: button },
                            ])
                        }
                        retryCount++
                    } while (alertButtons && retryCount < 5)
                } catch (error: unknown) {
                    console.log(
                        `Unable to dismiss alert buttonLabel ${button} on iOS. Reason: ${(error as Error).message}. Trying to infer the dismiss button.`,
                    )
                    await this.driver.executeScript('mobile: alert', [
                        { action: 'dismiss' },
                    ])
                }
                break
            default:
                console.log(
                    `Platform should be PWA, and it is ${currentPlatform}, no alerts to accept`,
                )
        }
    }

    async getClipboard(): Promise<string> {
        try {
            let clipboardContent = ''
            switch (currentPlatform) {
                case Platform.ANDROID:
                    try {
                        const base64Content = (await this.driver.executeScript(
                            'mobile: getClipboard',
                            [],
                        )) as string
                        if (base64Content) {
                            clipboardContent = Buffer.from(
                                base64Content,
                                'base64',
                            ).toString('utf8')
                            console.log(
                                `Retrieved clipboard content on Android. It is ${clipboardContent}`,
                            )
                        } else {
                            console.warn(
                                'Received empty or invalid clipboard data from Android',
                            )
                        }
                    } catch (error: unknown) {
                        console.error(
                            `Failed to get Android clipboard: ${(error as Error).message}`,
                        )
                    }
                    break
                case Platform.IOS:
                    try {
                        const content = (await this.driver.executeScript(
                            'mobile: getPasteboard',
                            [],
                        )) as string
                        if (content) {
                            clipboardContent = content
                            console.log('Retrieved clipboard content on iOS')
                        } else {
                            console.warn(
                                'Received non-string clipboard data from iOS',
                            )
                        }
                    } catch (error: unknown) {
                        console.error(
                            `Failed to get iOS clipboard: ${(error as Error).message}`,
                        )
                    }
                    break
                default:
                    console.log(`TODO: Implement clipboard functions for PWA`)
            }
            return clipboardContent
        } catch (error: unknown) {
            console.error(
                `Unexpected error getting clipboard: ${(error as Error).message}`,
            )
            return ''
        }
    }

    async setClipboard(clipboardContent: string): Promise<void> {
        switch (currentPlatform) {
            case Platform.ANDROID:
                try {
                    await this.driver.executeScript('mobile: setClipboard', [
                        {
                            content:
                                Buffer.from(clipboardContent).toString(
                                    'base64',
                                ),
                        },
                    ])
                } catch (error: unknown) {
                    console.log(
                        `Unable to push content to clipboard on Android. Reason: ${(error as Error).message}`,
                    )
                }
                break
            case Platform.IOS:
                try {
                    await this.driver.executeScript('mobile: setPasteboard', [
                        {
                            content:
                                Buffer.from(clipboardContent).toString('utf8'),
                        },
                    ])
                } catch (error: unknown) {
                    console.log(
                        `Unable to push content to clipboard on iOS. Reason: ${(error as Error).message}`,
                    )
                }
                break
            default:
                console.log(`TODO: Implement clipboard functions for PWA`)
        }
    }

    // Method to be implemented by each test class
    abstract execute(): Promise<void>
}
