---
name: x-post
description: Draft an X (Twitter) post for Tenderwize. Use when asked to write/draft a tweet, X post, or social post for Tenderwize, or to review a draft against house style. Covers the four post pillars — Interesting Tender, Market Insight, Contract Award, Procurement Insight.
---

# Writing an X post for Tenderwize

The full house style rules live in `X_POSTS_GUIDELINES.md` in this skill's own directory (`.claude/skills/x-post/X_POSTS_GUIDELINES.md`) — **read that file before drafting anything**, it is the source of truth (voice, structure, formatting, do's/don'ts, pre-publish checklist). This skill only adds the workflow around it.

If the draft will name a Tenderwize feature (the "capability" step of the value-first formula in guidelines section 3), also read `FEATURES.md` in the same directory first — it's the fixed list of what Tenderwize actually does. Never name a feature that isn't on that list.

There is also an in-app AI generator at `admin/x-posts` (backed by `POST /x-posts/adm/generate`) that follows the same guidelines file, saves results as drafts in the database, and auto-renders a branded card image (1200×675, see guidelines section 4) from the post's hook via `POST /x-posts/adm/:id/image`. For Interesting Tender, Market Insight, and Contract Award it queries Tenderwize's real tender/award data itself (via LLM tool-calling against MongoDB) and refuses to generate if nothing real matches the topic — it never invents facts. This skill is for conversational drafting/review in chat — it does not write to the database, render images, or run that tool-calling pipeline. If the user wants the result persisted as a draft (with its image and verified data), tell them to run it through the admin panel's "Generate" form (same topic/pillar/notes), or paste your draft into the "extra notes" field there.

## Workflow

1. **Identify the pillar.** If the user didn't say which of the four post types they want, ask, or infer it from what they're describing:
   - 🔥 **Interesting Tender** — one specific, currently open tender.
   - 📊 **Market Insight** — a stat/trend from Tenderwize's own data.
   - 🏆 **Contract Award** — a completed award (buyer, winner, amount).
   - 💡 **Procurement Insight** — evergreen educational content, no data needed.

2. **Ground it in real data for the first three pillars.** Never invent a buyer name, amount, CPV code, or deadline.
   - If the user already gave you the specifics (pasted a tender, a number, a notice), use those.
   - Otherwise, look for real data before writing: the local MongoDB (`mongodb://127.0.0.1/<DB_NAME from .env>`, collections `tenders` and `awardtenders`) if you have DB/shell access in this session, or the admin API (`/tenders/adm`, `/x-posts/adm`, etc. — see `admin/app.js` for the calling pattern) if a server + admin token are available. If neither is available, ask the user for the specific facts rather than guessing.
   - For **Interesting Tender**, explicitly check the submission deadline is still in the future before treating it as a live opportunity.
   - **Procurement Insight** needs no data lookup — it's expertise content.

3. **Draft** following `X_POSTS_GUIDELINES.md` section 6 (single post) or section 7 (thread), matching the pillar's specific rules from section 3, and keep the card image in mind (section 4) — the hook (first post) is what gets rendered onto it. If the post links anywhere, follow section 9: only use a URL you actually have (from the user, real data you looked up, or context) — never construct or guess one, e.g. by pattern-matching a tender id into `tenderwize.com/en/tenders/{id}`.

4. **Self-check against the pre-publish checklist** (section 12 of the guidelines) before presenting the draft. Fix anything that fails rather than presenting a draft you know breaks a rule.

5. **Present the draft(s)** with the pillar labeled, plus a one-line note on where the facts came from (so the user can verify them). If you wrote a thread, number the posts so the user can see the split.
