---
name: pr-submissions-checklist
description: Must read before submitting PRs to the Fedi project
---

# PR Submissions Checklist

Use this before creating or updating a PR for the Fedi project.

## Pre-submit checks

- Verify `just final-check` passes locally before submitting when the change affects code. In this repo it runs `lint` and `clippy`.
- For changes that affect runtime behavior or UI logic, also run the relevant tests, such as `just test` or targeted UI test commands.

## PR description

A PR description should typically use these sections:

### Summary

Start with a single paragraph summarizing the change.

### Details

Explain why the change is being done, how its goals are achieved, and the most important design decisions.

### Reviewing

Optionally explain which aspects reviewers should think through carefully, be opinionated about, or just be aware of.

### Testing

Optionally explain how reviewers can gain confidence that the change is solid. Mention automated tests added, existing tests that cover the functionality, or manual testing instructions.
