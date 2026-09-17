# Cross-check: hand one AI session to another AI for an independent review

Status: parked / not scheduled — 2026-09-16

One-liner: from the page of one AI (Chat or Code), click Token Police →
**Cross-check**, pick a second AI, and Token Police hands the current session's
full conversation (plus, for Code, the repo/PR/test context) to that second AI
with a fixed review instruction, so it independently checks the first AI's work.

Token Police is only the **bridge** between two browser tabs. It does not call
any model API and does not send anything to its own server. It reads the
current tab, opens the reviewer's tab, and fills the review prompt — exactly
the same trust model as Dispatch today.

---

## Why this fits Token Police (and where it does NOT)

Some plumbing already exists and is genuinely reusable. Some does not — and the
part that does not is the hard, fragile part. Do **not** estimate this as
"mostly done."

Already there (reuse it):

- Opening / focusing / tiling reviewer tabs — `background.js` + `agents.js`
  `tileRects()`.
- Content scripts already inject into the 5 hosts (claude.ai, chatgpt.com,
  grok.com, cursor.com, gemini.google.com) — `manifest.json` `content_scripts`.
- **Writing** a prompt into a composer — `content.js` `fillComposer()`,
  `findSendButton()`, `scheduleSubmit()`.
- Chat vs Code is already a first-class distinction — `agents.js` `kind`,
  `agentKind()`, `agentsForKind()`.
- Dispatch's open → pending → fill message flow (`dispatch*` in `background.js`
  / `popup.js`) is the right skeleton to copy.

NOT there yet — this is the real work:

- **Reading the full conversation out of the source page.** `content.js` today
  only reads usage *numbers* off the usage pages (`makeAgents()`) and *writes*
  prompts into composers. There is **no** transcript-extraction code at all.
  This is where all the fragility lives: every site's DOM differs, old messages
  lazy-load on scroll, tool calls / diffs / images / logs are custom
  components, and a site redesign breaks the selectors. Each supported source
  page needs its own extractor.

Honest split: the tab plumbing is done; the payload (the conversation itself)
is not, and the payload is ~all of the risk.

---

## Chat vs Code — same pipeline, different payload

The interaction and transport are identical:

read current tab → normalize to a session object → open reviewer tab →
fill review instruction + content → user confirms send (default) / auto-send.

The difference is only what gets collected, and what the reviewer can do:

| Source | Collect |
|---|---|
| Chat | full user↔AI messages, attachment names, links |
| Code | full messages **+** repository, branch, PR, commit/diff, test results, the agent's tool-run log |

| Pairing | Reviewer can |
|---|---|
| Chat → Chat | review the answer, logic, whether the ask was understood |
| Chat → Code | also open the repo to verify code |
| Code → Chat | review reasoning and the PR, but usually can't actually run code |
| Code → Code | fullest: read the session, inspect repo, run tests, verify changes |

One feature, not two. Token Police auto-detects whether the current page is
Chat or Code. If the source is Code, default the reviewer to another Code
agent; still allow a Chat reviewer, but warn "it may only review the
conversation, not actually run the project."

Normalized session object:

```js
{
  sourceAgent: "codex",
  sourceKind:  "code",         // 'chat' | 'code'
  conversation: [ /* {role, text, ...} */ ],
  repository:  "...",          // code only
  branch:      "...",          // code only
  pullRequest: "...",          // code only
  sessionUrl:  "..."
}
```

First version may treat Chat and Code the same (send the full conversation
only). Add repo / PR / diff / test fields to the Code path once the base flow
is stable.

---

## MVP scope

- **One direction, one pair first.** Pick the source page with the most stable
  DOM and get its extractor solid before adding others. Do the extractor
  **before** the UI — the UI is a recombination of existing pieces (roughly a
  day); whether a full transcript can be pulled out reliably is what decides if
  the feature works at all.
- **Prefill only. No auto-send in v1.** See gotcha 1 — auto-sending into a Code
  agent is deliberately off in the current code. User reviews the filled prompt
  and hits send.
- **Long conversations → generate a local `conversation.md` and hand that to
  the reviewer** (file created in the browser, uploaded to the reviewer's own
  page), instead of cramming it into a composer. See gotcha 2.
- Privacy prompt on by default (see below).

Non-goals for v1 (explicitly out): GitHub Action, any model API, a "Product
Tree" / bundle format, rendering the reviewer's findings inside Token Police
(the reviewer's output lives in its own page — Token Police can't draw or read
it back), and auto-send into Code agents.

---

## Known gotchas (each has a code reason — don't design around them, design *with* them)

1. **Auto-send into Code agents is intentionally OFF.** `agents.js`
   `canAutoSend()` returns true only for `kind: 'chat'`. The comment there
   explains: Codex / Cursor / Grok Build composers have flaky submit paths
   (rich-text editors that reconcile the prompt away, Grok's mode switch that
   rehangs the composer), and a wrong/empty send burns real quota. So the
   headline "auto-send the review to Claude Code / Codex" is exactly the path
   the code refuses to auto-submit today. v1 is prefill-only.

2. **Claude Code's only reliable fill is the `?prompt=` URL param, which has a
   length limit.** `agents.js` `buildDispatch()` uses `fill: 'query'` for
   `claude-code`. A long transcript won't fit in a URL, so handing a long
   conversation to Claude Code can't use the reliable query path — it needs
   script-fill into the composer (less proven), or the `conversation.md` upload
   route above.

3. **Transcript extraction is per-platform and fragile.** No shared extractor
   works across sites. Budget for one extractor per source page, plus handling
   lazy-loaded history (scroll to load) and custom message components (tool
   calls, diffs, images).

4. **Token Police can't show the review result.** The reviewer's findings
   render inside the reviewer's own page. Token Police's surface is only the
   handoff panel. Don't promise an in-extension results view.

---

## The fixed review prompt: default + user-editable

The review instruction ships as a built-in default the user can edit, with a
reset-to-default. Same "default + user override" pattern the codebase already
uses for settings (stored in `chrome.storage.local`, like `dispatchPrompt`).

- `DEFAULT_CROSSCHECK_PROMPT` lives in code (ideally in the i18n system so the
  default follows `uiLang` — EN / FR / 中文). Once the user edits it, their
  text wins and no longer tracks language.
- Read as `res.crosscheckPrompt || DEFAULT_CROSSCHECK_PROMPT` — an empty box
  intentionally falls back to the default; that is the wanted behavior here,
  not a bug.
- A "Reset to default" button clears `crosscheckPrompt` in
  `chrome.storage.local` so the read falls back to the default again.

Default review prompt (draft):

> Below is a full development session between another coding agent and a user.
> Independently review whether it correctly understood and completed the user's
> request. Check its code changes, PR, test results and completion claims. Do
> not assume the previous agent's conclusions are correct. Point out omissions,
> errors, potential regressions, and anything still unverified.

Then the normalized session is appended.

---

## Privacy note (must be surfaced)

Token Police still sends nothing to its own server. But clicking Cross-check
sends agent A's content to the agent B the user picked. That action must be
clearly stated and, by default, require the user to confirm before anything is
sent.

---

## Code touchpoints (for whoever implements this)

- New: a transcript extractor per source page (new module, e.g.
  `conversation-adapters.js`) — the hard part; start with one platform.
- New: review-prompt assembly + GitHub-link detection + length handling (e.g.
  `review.js`), including the `conversation.md` fallback for long sessions.
- Reuse: `content.js` `fillComposer()` / `findSendButton()` for the write side.
- Reuse + extend: `background.js` dispatch open/tab flow — add a
  `captureConversation` request (source tab → extractor) and a `reviewOpen`
  flow (open reviewer tab, fill review instruction + payload).
- Reuse: `agents.js` `kind`, `buildDispatch()`, `tileRects()`,
  `makeDispatchJob()` as the model for a review job.
- Settings: add `crosscheckPrompt` (editable + reset) alongside the existing
  `dispatch*` settings.
