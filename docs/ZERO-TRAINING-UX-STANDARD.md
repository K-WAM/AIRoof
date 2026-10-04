# ZERO-TRAINING UX/UI SIMPLIFICATION STANDARD

Owner's standard, saved verbatim 2026-10-04. Applies to every screen, role and workflow. The short pass/fail reviewer's
version is `docs/SCREEN-CLARITY-HEURISTICS.md` (C1–C10); Nielsen's 10 stay the base (`docs/USABILITY-AUDIT-2026-10-03.md`).

**This product, concretely (owner, 2026-10-04):** a roofing company has an admin, office staff, technicians,
inspectors and workers — plus contractors who will NOT take time to learn this app. The inspector inspects to
determine repair scope and writes up findings and a quote. If accepted, the quote becomes the work scope for the
workers, who give field updates (contractors included — no sign-up steps, quick). When they are done it goes out as
an invoice. The calendar must be smooth. No confusing buttons; easy navigation; minimalistic and simple, like the
Airbnb app. The field update in particular must be really, really easy for new users.

---

Use the following criteria when reviewing, designing, or refactoring this application.

PRIMARY OBJECTIVE

The application must be:

Self-explanatory, zero-training, low-friction, fast, predictable, and difficult to use incorrectly.

A first-time user of every supported user type/role should be able to enter the application and successfully complete their normal tasks without:

- training
- documentation
- tutorials
- onboarding calls
- prior knowledge of the system
- memorizing workflows
- guessing what buttons mean
- asking where functionality is located

Do not optimize merely for visual minimalism. Optimize for minimum cognitive effort required to successfully complete a task.

Preserve necessary functionality while aggressively reducing unnecessary complexity.

---

1. THE ZERO-TRAINING TEST

For every page, modal, form, dashboard, workflow, and major component, ask:

1. Can a first-time user understand what this screen is for within approximately 3 seconds?
2. Is it immediately obvious what they should do next?
3. Is the primary action visually obvious?
4. Can the user predict what will happen before clicking an action?
5. Are labels understandable without product-specific knowledge?
6. Is all information currently displayed necessary at this moment?
7. Can secondary information or advanced functionality be progressively disclosed?
8. Can the task be completed with fewer decisions, clicks, fields, or screens?
9. Does the interface prevent common mistakes rather than merely explaining them afterward?
10. Would a reasonable user need instructions to use this screen?

If #10 is yes, treat that as a UX defect and attempt to redesign the interaction.

Do not solve confusing UX by adding explanatory paragraphs, excessive tooltips, tours, help icons, or documentation unless the underlying complexity is genuinely unavoidable.

The interface itself should teach the user how to use it.

---

2. DESIGN FOR EVERY USER ROLE

Identify all user roles supported by the application.

For each role:

- determine its most common jobs-to-be-done
- identify the information that role actually needs
- identify its most frequent actions
- identify actions it rarely uses
- identify information/actions it should not see
- optimize navigation and hierarchy accordingly

Do not expose functionality merely because the backend supports it.

Each user should see an application that feels designed specifically for their responsibilities.

Use permissions and contextual presentation to reduce irrelevant complexity.

Do not make inexperienced users understand the application's underlying data model or organizational structure.

---

3. ONE CLEAR PURPOSE PER SCREEN

Every screen should have a clearly identifiable primary purpose.

Avoid screens that simultaneously behave as:

- dashboards
- forms
- reports
- configuration panels
- help centers
- action menus

If a screen has several competing purposes, reorganize it.

The user should immediately understand:

Where am I?
What am I looking at?
What matters?
What can I do?
What should I do next?

---

4. VISUAL HIERARCHY

Create an unmistakable hierarchy.

Generally:

Page purpose → critical status/information → primary action → core content → secondary actions → advanced/detail information

Avoid giving every component equal visual weight.

There should normally be only one dominant primary action per context.

Secondary actions must visually appear secondary.

Destructive or unusual actions must not compete with normal workflow actions.

---

5. PROGRESSIVE DISCLOSURE

Do not display every capability simultaneously.

Show:

what users need now

and reveal:

what users might need later

through appropriate mechanisms such as:

- contextual menus
- expandable sections
- details views
- advanced settings
- secondary tabs
- "More" menus

Frequently used functionality must remain readily accessible.

Do not hide important actions merely to make the UI appear cleaner.

The objective is not fewer visible pixels.

The objective is less simultaneous cognitive complexity.

---

6. REDUCE COGNITIVE LOAD

Every visible element consumes attention.

For each UI element ask:

Does this help the user understand the current state or complete the current task?

If not, remove, combine, relocate, or progressively disclose it.

Reduce:

- redundant labels
- unnecessary descriptions
- duplicate information
- decorative containers
- excessive cards
- unnecessary borders
- excessive headings
- excessive badges
- excessive icons
- competing CTAs
- repeated navigation
- unnecessary confirmation steps
- unnecessary form fields
- unnecessary status indicators

Do not turn every piece of information into a card.

Use whitespace and typography to establish hierarchy before adding containers.

---

7. RECOGNITION OVER RECALL

Never require users to remember information that the interface could show them.

Prefer:

- visible choices over memorized commands
- descriptive labels over unexplained icons
- contextual actions over distant actions
- prefilled known information
- recent/relevant choices where appropriate
- sensible defaults
- human-readable names instead of internal IDs
- clear status indicators

The system should carry the cognitive burden, not the user.

---

8. PLAIN LANGUAGE

Use terminology users naturally understand.

Avoid:

- internal engineering terminology
- database terminology
- unnecessary industry jargon
- abbreviations without context
- vague CTA labels

Prefer specific actions.

For example:

Bad:
"Submit"
"Proceed"
"Manage"
"Action"
"Continue"

Better:
"Send invitation"
"Save lease"
"Add resident"
"Pay $1,850"
"Download report"

Users should know what will happen before clicking.

---

9. FRICTIONLESS WORKFLOWS

Audit every important workflow end-to-end.

Count:

- clicks
- screens
- decisions
- required fields
- context switches
- confirmations
- repeated data entry

Remove steps that do not provide meaningful value.

Do not require users to:

- enter information the system already knows
- select obvious defaults
- repeatedly confirm harmless actions
- navigate elsewhere to obtain information the system already has
- manually perform operations that can safely be inferred or automated

A task that can safely be completed in 2 steps should not require 5.

---

10. SMART DEFAULTS

Use strong defaults wherever there is a safe and predictable choice.

The ideal workflow is often:

system makes the likely correct choice → user reviews → user confirms

rather than:

system asks user to configure everything from scratch.

Defaults must remain visible and editable when appropriate.

---

11. ERROR PREVENTION

Design workflows so common errors are difficult to make.

Prefer prevention over error messages.

Use:

- appropriate input types
- inline validation
- constraints
- sensible defaults
- disabled impossible actions
- contextual warnings
- clear destructive-action differentiation
- confirmation only when consequences justify it
- undo where practical

Do not punish every action with a confirmation dialog.

Reserve confirmation for destructive, irreversible, financially consequential, or otherwise high-risk actions.

---

12. FORGIVING UX

Users will click the wrong thing.

Design accordingly.

Where practical provide:

- Undo
- Back
- Cancel
- autosave
- drafts
- recoverable deletion
- preservation of entered information
- clear recovery paths

Never erase substantial user work because of navigation or a minor error.

---

13. CONTEXTUAL ACTIONS

Place actions near the objects they affect.

For example, actions for a specific record should generally be accessible from that record rather than requiring navigation to another management screen.

Avoid giant global toolbars containing unrelated actions.

Context reduces cognitive load.

---

14. CONSISTENCY

The same interaction must behave the same way throughout the application.

Standardize:

- button hierarchy
- terminology
- spacing
- typography
- forms
- tables
- menus
- filters
- search
- dialogs
- drawers
- notifications
- loading states
- empty states
- errors
- success feedback

If two things look the same, they should behave the same.

If two things behave differently, there should be a visible reason.

---

15. USE FAMILIAR CONVENTIONS

Do not invent novel interaction patterns when established ones already exist.

Users already understand common patterns such as:

- search
- filters
- tabs
- back navigation
- breadcrumbs where appropriate
- three-dot overflow menus
- checkboxes
- dropdowns
- toggles
- editable fields
- standard form controls

Innovation should occur in the product's capabilities, not in making users relearn basic interface behavior.

---

16. NAVIGATION

Navigation should reflect users' mental models rather than the codebase or database architecture.

Top-level navigation should be limited to genuinely top-level concepts.

Avoid deep navigation hierarchies when possible.

Users should rarely wonder:

"Where would I find that?"

Avoid putting the same destination in several unrelated places unless there is a strong contextual reason.

Preserve clear location awareness.

---

17. FORMS

Aggressively simplify forms.

For every field determine whether it is actually necessary.

Use:

- logical grouping
- useful defaults
- autofill
- autocomplete
- appropriate input controls
- inline validation
- contextual helper text only where needed

Do not ask for optional information merely because there is a database field for it.

Long workflows may be divided into logical stages, but do not create unnecessary wizard steps simply to make individual screens look shorter.

---

18. EMPTY STATES

An empty screen should explain itself.

Instead of:

"No records"

prefer an empty state that communicates:

- what belongs here
- why it is useful
- the obvious next action

Keep this concise.

The user should never reach a blank screen and wonder what to do.

---

19. STATUS AND SYSTEM FEEDBACK

Users should always understand what the system is doing.

Clearly communicate:

- saving
- saved
- sending
- processing
- success
- failure
- pending
- disabled/unavailable states

Do not leave users wondering whether their action worked.

Prefer immediate feedback.

Use optimistic UI only where failure can be handled safely.

---

20. PERFORMANCE IS PART OF UX

Treat perceived and actual performance as a core usability requirement.

Audit for:

- unnecessary network requests
- request waterfalls
- oversized bundles
- unnecessary JavaScript
- excessive client rendering
- unnecessarily large images/assets
- unnecessary re-renders
- blocking operations
- inefficient queries
- duplicated requests
- loading entire datasets when pagination/lazy loading is appropriate

Prioritize loading the content necessary for the user's immediate task.

Use:

- caching where appropriate
- prefetching where useful
- lazy loading for secondary content
- skeleton states when appropriate
- optimistic updates where safe
- pagination/virtualization for large datasets
- efficient server-side data retrieval

Avoid full-page loading states when only one component is updating.

The interface should feel immediate.

---

21. RESPONSIVE UX

Do not treat mobile as a compressed desktop interface.

At each viewport:

- preserve the primary task
- preserve obvious navigation
- maintain readable hierarchy
- avoid horizontal scrolling
- maintain usable touch targets
- progressively disclose secondary information where necessary

Test desktop, tablet, and mobile intentionally.

---

22. ACCESSIBILITY

Meet WCAG 2.2 AA as a baseline.

Review:

- contrast
- keyboard navigation
- focus states
- semantic HTML
- labels
- screen-reader semantics
- touch/click target size
- error identification
- form accessibility
- reduced-motion behavior
- zoom/reflow

Accessibility improvements frequently improve usability for everyone.

---

23. DO NOT OVER-DESIGN

Avoid unnecessary:

- animations
- gradients
- shadows
- cards
- iconography
- decorative illustrations
- nested containers
- floating controls
- modal dialogs

Use visual treatment when it communicates hierarchy, state, grouping, or interaction.

Minimalism is not the objective.

Clarity is.

---

24. PRESERVE CAPABILITY WHILE HIDING COMPLEXITY

Do not remove important functionality merely because it makes a screen complex.

Instead ask:

Does this functionality need to be visible right now?

Advanced functionality can remain powerful while being progressively disclosed.

The desired result is:

simple for beginners, efficient for frequent users, powerful for advanced users.

---

25. ROLE-SPECIFIC END-TO-END TEST

For every supported user role, identify its 5–10 most important workflows.

Simulate a first-time user completing each one.

For each workflow ask:

- Where could they hesitate?
- Where could they misunderstand terminology?
- Where could they make a mistake?
- Where are unnecessary decisions required?
- Where are unnecessary clicks required?
- Where is information missing?
- Where is too much information displayed?
- Where might they need training?
- Where might they need to ask another person what to do?
- Where does the application feel slow?

Resolve these issues at the design or implementation level.

---

26. THE "NO MANUAL" RULE

Assume:

There is no manual.
There is no training session.
There is no implementation consultant standing beside the user.

The product itself must be sufficient.

If users repeatedly need documentation to understand a normal workflow, redesign the workflow before writing more documentation.

Help content should support exceptional situations, not compensate for ordinary UX problems.

---

27. THE FINAL SIMPLICITY TEST

Before considering any screen complete, ask:

"Could someone who has never seen this product understand what this screen is, what matters, and what to do next without asking anyone?"

Then ask:

"Can we remove anything without reducing comprehension or capability?"

Then:

"Can we eliminate a decision, click, field, wait, or navigation step?"

Then:

"Can the system safely do any of this work for the user?"

If yes, simplify further.

---

REFERENCE FRAMEWORKS

Use these principles in conjunction with:

- Nielsen Norman Group — 10 Usability Heuristics
- Nielsen Norman Group — Progressive Disclosure
- Nielsen Norman Group — Recognition Rather Than Recall
- Cognitive Load Theory
- Hick's Law
- Fitts's Law
- Jakob's Law
- Apple Human Interface Guidelines
- Google Material Design
- GOV.UK Design Principles and Service Standard
- WCAG 2.2 AA

Do not mechanically apply a framework where it worsens the actual user experience. Use them as evidence-based design constraints.

---

IMPLEMENTATION REQUIREMENT

Do not merely produce a UX report.

Inspect the existing application and implement justified improvements.

Before changing functionality, understand:

- existing user roles
- permissions
- workflows
- business rules
- shared components
- design system
- backend dependencies

Then work systematically through the application.

Prioritize improvements in this order:

1. User confusion / task failure
2. Incorrect or dangerous actions
3. Navigation and workflow friction
4. Information hierarchy
5. Unnecessary complexity
6. Performance and perceived latency
7. Accessibility
8. Visual consistency
9. Cosmetic refinement

Reuse and improve shared components instead of creating page-specific hacks.

Do not perform a wholesale redesign solely for visual novelty.

Do not break working business logic.

Do not remove functionality unless it is demonstrably redundant or obsolete.

Where a major structural change carries significant product or business implications, identify it before implementing it.

The finished application should require less thinking, less clicking, less waiting, and less explanation while retaining its required capabilities.

SUCCESS CRITERION

The standard is not:

"The UI looks cleaner."

The standard is:

A first-time user, regardless of role, can open the application and correctly complete their core tasks quickly and confidently without training, while experienced users can work efficiently without unnecessary friction.
