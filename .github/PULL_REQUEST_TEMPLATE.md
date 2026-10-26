<!--
Use this template for any change: UI, bridge, backend, tooling, CI, or documentation.
Keep the description brief and omit sections that do not apply. Choose evidence by the behavior affected, not the file type or size of the diff. Remove these instructions from the published description.
-->

## Description

<!--
State the problem or motivation and the resulting behavior. Link related issues or dependent PRs when relevant. Include only context a reviewer cannot get from the diff.
-->

## Screenshots/Videos

<!--
For changes to visible UI or user interactions, include before and after screenshots for each affected platform (iOS, Android, web) without waiting for a reviewer to request them. This also applies when bridge, backend, dependency, or configuration changes affect what users see or do.

Choose captures that demonstrate the change:

- Layout, styling, text, or assets: show the affected screen and relevant theme or viewport variants
- Navigation, forms, gestures, or animation: show the relevant states and add a recording to demonstrate the interaction
- Loading, empty, error, permission, or success states: reproduce the affected state rather than showing only the default screen
- Data, RPC, or native integration changes with visible effects: show the resulting UI, such as a balance, progress indicator, or error message
- New UI: show the prior screen or entry point as the before state

Capture before from the base version and after from this PR. Use the same screen, app state, theme, and viewport for each pair. Label each platform and show before and after side by side.

Give every screenshot in a comparison the same displayed height, including across iOS and Android. Use HTML image tags with a shared height, such as height="400", and omit width to preserve aspect ratios. Do not stretch or crop away relevant UI to match sizes.

Example (replace the URLs and include only affected platforms):

| Platform | Before | After |
| --- | --- | --- |
| iOS | <img src="BEFORE_IOS_URL" alt="iOS before" height="400"> | <img src="AFTER_IOS_URL" alt="iOS after" height="400"> |
| Android | <img src="BEFORE_ANDROID_URL" alt="Android before" height="400"> | <img src="AFTER_ANDROID_URL" alt="Android after" height="400"> |
| Web | <img src="BEFORE_WEB_URL" alt="Web before" height="400"> | <img src="AFTER_WEB_URL" alt="Web after" height="400"> |

Check the rendered PR to confirm images load, labels are correct, and displayed heights match. If a capture is blocked, state the affected platform and reason here.

Omit this section for changes with no visible UI or interaction effects, such as internal refactors, test infrastructure, or documentation edits.
-->

## Testing

<!--
Briefly state what you exercised and the observed result. Choose verification relevant to the change:

- UI or user flows: affected platforms and scenarios, including relevant failure states
- Bridge, backend, or shared logic: unit or integration coverage of the affected behavior; compatibility or migration checks when protocols or persisted data change
- Build, CI, scripts, or dependencies: the command, dry run, or workflow that exercises the change
- Documentation or configuration: relevant link, syntax, rendering, or behavior checks

Do not repeat the PR's CI status or paste long logs. If manual QA is needed, put the requested steps in QA Testing Guidance.
-->

## Impact on native/web parity

<!--
Keep this section when behavior or support differs across iOS, Android, or web, or when shared behavior changes. Briefly describe whether the platforms behave consistently. Explain intentional differences and link follow-up work where needed.

Omit this section when platform behavior is unaffected.
-->

## QA Testing Guidance

<!--
Keep this section when a reviewer or QA tester needs to verify behavior manually, including user-facing effects of bridge or backend changes.

Give the relevant platform, app flavor or web URL, environment, and setup. List concise actions and expected results for the affected flow, including failure or recovery cases when relevant. Separate these requested checks from verification already performed in Testing.

Omit this section when no manual QA is needed.
-->
