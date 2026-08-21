# User Interview Script: 8 Bit RTS — Simple RTS Game

> **Goal:** Validate that "no maintained browser RTS delivers a complete match in
> a short session" is a real, recurring gap — and, more importantly, that the
> latent desire is strong enough to overcome a costless alternative.
> **Duration:** 30 minutes · **Format:** 1:1 semi-structured
> **Recruit:** Casual desktop browser players who have played or watched an RTS
> at some point, play in short opportunistic sessions, and do not currently play
> an RTS regularly. *(Recruiting lapsed/nostalgic players is the point — current
> RTS players are the wrong segment and will mislead you.)*

> **Interviewer discipline.** The severity score for this problem is 4/10. You
> are looking for evidence that could *lower* it as readily as raise it. Ask
> about past behaviour, never about hypothetical future behaviour — "would you
> play this?" produces a polite yes that means nothing. Question 4 and question 9
> carry most of the signal in this script.

## Warm-up (5 min)

1. Walk me through the last time you had 15 or 20 spare minutes and decided to
   play something on your computer. What did you actually open?
2. How often does that kind of spare-session gaming happen for you?
3. When you want something a bit more thoughtful than a puzzle game, where do
   you go?

## Problem Exploration (10 min)

4. **Tell me about the last time you played, or wanted to play, a strategy game.
   What happened?** *(If they cannot recall one: that itself is the finding —
   probe why, gently, then continue.)*
5. What was the hardest or most off-putting part of that experience?
6. When you have wanted that strategy itch scratched and did not act on it, what
   stopped you? Time, install, difficulty, something else?
7. Roughly how long does a session have to be before it feels "not worth
   starting"?
8. What would have made that easier to just... start?

## Current Solution Probe (10 min)

9. **Have you ever gone looking for a strategy game you could play in a browser?
   What did you find?** *(Direct test of H1. Listen for whether they searched at
   all — a segment that never searches has no felt gap.)*
10. What is the biggest thing missing from what you play today during short
    sessions?
11. Think about an RTS you know — StarCraft, Age of Empires, Command & Conquer,
    whichever. What parts of it did you enjoy, and what parts would you happily
    never see again?
12. If you could keep exactly one thing from that genre and throw away
    everything else, what would you keep?

## Validation Probe (5 min)

13. If a browser tab could give you a complete RTS match — build a base, make an
    army, win — in about ten minutes, walk me through when in your week you would
    actually open it.
14. On a scale of 1–10, how much would that matter to you? *(Then: "what would
    make it a 10?" — the gap is more informative than the number.)*
15. What would make you close the tab in the first minute?
    *(Direct test of Risk 2. Weight the answers heavily — they are the
    onboarding requirements.)*

## Wrap-up

16. Who else do you know who used to play strategy games and stopped?
17. Is there anything I have not asked that you think matters here?

## Scoring Rubric (fill after each interview)

| Signal | Score 1–5 | Notes |
|--------|-----------|-------|
| Problem frequency — does the spare-session gap recur? | | |
| Current pain level — is substituting genuinely painless? | | |
| Workaround quality — how good is "play something else"? *(reverse-scored: a good workaround scores low)* | | |
| Interest in solution — grounded in stated past behaviour, not enthusiasm | | |
| **Total** | /20 | |

> **Score ≥ 15/20** → Strong signal. The latent desire is real and reachable.
> **Score 10–14** → Moderate. Expected outcome for this problem. Proceed on
> craft grounds, but treat onboarding as the primary design risk.
> **Score < 10** → Weak. Confirms severity 4/10. This does not block a
> self-directed build — it means market framing should be dropped from the spec
> entirely and success measured against playability and code quality instead.

## What to do with the results

- Interviews are **optional** for this feature — the go decision does not depend
  on them (see problem-statement.md → "On the honesty of this score").
- Their real value is **H2 and Risk 2**: questions 11, 12, and 15 tell you which
  mechanics to cut and what makes a first minute legible. That is directly
  actionable in the Phase 2 product spec, regardless of what the severity score
  turns out to be.
