import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

export interface Fixture {
    /** State a successful run of this fixture leaves the device in. */
    produces: string
    /** States that must already be satisfied before this fixture can run. */
    requires: readonly string[]
    run: (t: AppiumTestBase) => Promise<void>
}
