# dsh-quiz

`dsh-quiz` turns a DeepSeek Harness conversation answer into optional practice and a user-curated question bank.

The first release deliberately keeps the learning loop conversational:

1. The user asks for one or more single-choice, multiple-choice, or true/false questions.
2. The model creates temporary drafts grounded in an exact excerpt of the current answer.
3. The user answers and receives deterministic grading plus the stored explanation.
4. Only an explicit user choice saves a draft to the durable question bank.
5. Review is a separate opt-in flag; saving never silently schedules review.

The Web plugin adds three dedicated surfaces:

- an **出题** action below every finalized assistant answer, with type, count, and difficulty controls;
- replayable question cards with native radio buttons or checkboxes, deterministic grading, and explicit save/review choices;
- a **题库** sidebar entry with topic search, review filtering, and attempt statistics.

## Install from a checkout

Build the plugin, then add it to the DSH Web profile:

```sh
pnpm install
pnpm run verify
dsh plugin --profile web add .
dsh --profile web
```

For a GitHub installation, `prepare` builds the TypeScript sources. pnpm 10 requires the user to allow that package build before retrying the install. Publishing prebuilt npm artifacts avoids an install-time build.

## Conversation examples

```text
根据刚才关于闭包的回答，给我出两道单选题，先不要显示答案。
```

```text
第一题选 B。第二题选 A。把第二题加入题库，但先不要安排复习。
```

```text
列出题库里与 TypeScript 有关的题目，不要显示答案。
```

## Tools

- `quiz_create_draft` creates one to ten unsaved questions and links them to the owning DSH session.
- `quiz_answer` grades selected zero-based option indexes and records attempt totals.
- `quiz_save` persists a draft and independently sets its review opt-in.
- `quiz_list` browses saved questions by topic or review status.

Questions use DSH's domain storage facility. The Web profile supplies its configured non-session storage backend. Drafts are intentionally process-local and bounded; restarting DSH discards drafts that the user did not save.

## Current limitations

- Review opt-in is stored, but automatic scheduling and spaced repetition are not implemented.
- Generation quality remains model-dependent. Every saved question retains the exact source excerpt so users can inspect its basis.
- Questions are immutable after saving in this release. Editing and version history are deferred.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
```
