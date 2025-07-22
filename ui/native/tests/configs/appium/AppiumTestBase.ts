/* eslint-disable no-console */
import AppiumManager, { Platform, currentPlatform } from './AppiumManager'

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

    getLocatorStrategies(key: string): string[] {
        if (currentPlatform === Platform.ANDROID) {
            return [
                `accessibility id:${key}`,
                `android=new UiSelector().resourceId("${key}")`,
            ]
        } else {
            return [
                `accessibility id:${key}`,
                `id:${key}`,
                // `label == "${key}" OR name == "${key}" OR value == "${key}"`,
                // `label CONTAINS "${key}" OR name CONTAINS "${key}" OR value CONTAINS "${key}"`, test to see how this works
            ]
        }
    }

    async findElementByKey(key: string) {
        const strategies = this.getLocatorStrategies(key)
        const primaryStrategy = strategies[0]

        for (const strategy of strategies) {
            try {
                console.log(`Trying to find element with strategy: ${strategy}`)
                const element = await this.driver.$(strategy)
                const exists = await element.isExisting()

                if (exists) {
                    console.log(`Element found with strategy: ${strategy}`)
                    return element
                }
            } catch (error: unknown) {
                console.log(
                    `Strategy ${strategy} failed: ${(error as Error).message}. Trying the first strategy once again just to be sure.`,
                )
                const element = await this.driver.$(primaryStrategy)
                const exists = await element.isExisting()
                if (exists) {
                    console.log(
                        `Element found with primary strategy ${primaryStrategy} after the strategy failed the first time.`,
                    )
                    return element
                } else {
                    console.log(
                        `A repeat atttempt with primary strategy ${primaryStrategy} failed: ${(error as Error).message}. Element most likely does not exist in XML tree. Try dumping it.`,
                    )
                }
            }
        }

        return null
    }

    async findElementsByText(
        text: string,
        exactMatch = false,
        timeout = DEFAULT_TIMEOUT,
    ) {
        const startTime = Date.now()
        const platform = process.env.PLATFORM?.toLowerCase() || ''
        let elements

        while (Date.now() - startTime < timeout) {
            try {
                if (platform === 'android') {
                    // Android
                    if (exactMatch) {
                        elements = await this.driver.$$(
                            `android=new UiSelector().text("${text}")`,
                        )
                    } else {
                        elements = await this.driver.$$(
                            `android=new UiSelector().textContains("${text}")`,
                        )
                    }
                } else {
                    // iOS - try multiple strategies

                    // Strategy 1: iOS Predicate String
                    try {
                        let predicateQuery
                        if (exactMatch) {
                            predicateQuery = `label == "${text}" OR name == "${text}" OR value == "${text}"`
                        } else {
                            predicateQuery = `label CONTAINS "${text}" OR name CONTAINS "${text}" OR value CONTAINS "${text}"`
                        }

                        elements = await this.driver.$$(
                            `-ios predicate string:${predicateQuery}`,
                        )
                        if ((await elements.length) > 0) {
                            // Filter for only displayed elements
                            const displayedElements = []
                            for (const element of elements) {
                                if (await element.isDisplayed()) {
                                    displayedElements.push(element)
                                }
                            }
                            elements = displayedElements
                        }
                    } catch (error) {
                        // Predicate strategy failed, continue to next strategy
                        elements = []
                    }

                    // If no elements found with predicate, try XPath
                    if (elements.length === 0) {
                        try {
                            let xpathQuery
                            if (exactMatch) {
                                xpathQuery = `//XCUIElementTypeStaticText[@value="${text}"]`
                            } else {
                                xpathQuery = `//XCUIElementTypeStaticText[contains(@value, "${text}")]`
                            }

                            elements = await this.driver.$$(xpathQuery)
                            if ((await elements.length) > 0) {
                                // Filter for only displayed elements
                                const displayedElements = []
                                for (const element of elements) {
                                    if (await element.isDisplayed()) {
                                        displayedElements.push(element)
                                    }
                                }
                                elements = displayedElements
                            }
                        } catch (error) {
                            // XPath strategy failed
                        }
                    }

                    // If still no elements, try broader XPath
                    if (elements.length === 0) {
                        try {
                            let xpathQueryAny
                            if (exactMatch) {
                                xpathQueryAny = `//*[@label="${text}" or @name="${text}" or @value="${text}"]`
                            } else {
                                xpathQueryAny = `//*[contains(@label, "${text}") or contains(@name, "${text}") or contains(@value, "${text}")]`
                            }

                            elements = await this.driver.$$(xpathQueryAny)
                            if ((await elements.length) > 0) {
                                // Filter for only displayed elements
                                const displayedElements = []
                                for (const element of elements) {
                                    if (await element.isDisplayed()) {
                                        displayedElements.push(element)
                                    }
                                }
                                elements = displayedElements
                            }
                        } catch (error) {
                            // General XPath strategy failed
                        }
                    }
                }

                // If we found at least one visible element, return all of them
                if ((await elements.length) > 0) {
                    return elements
                }
            } catch (error) {
                // Continue trying until timeout
            }

            // Sleep briefly before retrying
            await new Promise(resolve => setTimeout(resolve, 500))
        }

        return []
    }

    async findElementByText(
        text: string,
        instanceNum: number,
        exactMatch = false,
        timeout = DEFAULT_TIMEOUT,
    ) {
        const elements = await this.findElementsByText(
            text,
            exactMatch,
            timeout,
        )

        if (elements.length === 0) {
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
    ): Promise<WebdriverIO.Element> {
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

    async waitForElementDisplayed(key: string, timeout = DEFAULT_TIMEOUT) {
        const strategies = this.getLocatorStrategies(key)
        const startTime = Date.now()
        const errors: Error[] = []

        while (Date.now() - startTime < timeout) {
            for (const strategy of strategies) {
                try {
                    console.log(
                        `Trying strategy ${strategy} for element ${key}`,
                    )
                    const element = await this.driver.$(strategy)
                    const isDisplayed = await element.isDisplayed()

                    if (isDisplayed) {
                        console.log(
                            `Element ${key} found and displayed with strategy: ${strategy}`,
                        )
                        return element
                    }
                } catch (error) {
                    errors.push(error as Error)
                }
            }

            await new Promise(resolve => setTimeout(resolve, 500))
        }
        if (currentPlatform === Platform.IOS) {
            // Android doesn't have this yet
            console.log('Dumping XML tree')
            await this.driver.executeScript('mobile: source', [
                { format: 'xml' },
            ])
        }
        throw new Error(
            `Element with key "${key}" not displayed after ${timeout}ms. Tried strategies: ${strategies.join(', ')}. Errors: ${errors.map(e => e.message).join('; ')}`,
        )
    }

    async clickElementByKey(
        key: string,
        timeout = DEFAULT_TIMEOUT,
    ): Promise<void> {
        console.log(`Attempting to click element: ${key}`)
        const element = await this.waitForElementDisplayed(key, timeout)
        await element.click()
        console.log(`Successfully clicked element: ${key}`)
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

    async acceptAlert(button?: string): Promise<void> {
        if (currentPlatform === Platform.ANDROID) {
            try {
                await this.driver.executeScript('mobile: acceptAlert', [])
            } catch (error: unknown) {
                console.log(
                    `Unable to accept alert on Android. Reason: ${(error as Error).message}`,
                )
            }
        } else {
            try {
                await this.driver.executeScript('mobile: alert', [
                    { action: 'accept', button: `${button}` },
                ])
            } catch (error: unknown) {
                console.log(
                    `Unable to accept alert on iOS. Got error ${(error as Error).message}`,
                )
            }
        }
    }

    // Method to be implemented by each test class
    abstract execute(): Promise<void>
}
