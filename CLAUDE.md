# KaraoQ — contributor guide

## Component size & structure

Keep components small and single-purpose. A file that renders a whole screen is
an orchestrator, not a component — it should wire state to children, not inline
their markup.

**Hard rule: no component file over ~300 lines.** If a `.tsx` file grows past
that, stop and split it before adding more. (`components/Host.tsx` was allowed to
reach 2,300 lines; that was a mistake we deliberately unwound — don't recreate
it.)

### How to split

When a component gets large, extract along these seams — in this order of
preference, because each is lower-risk than the last:

1. **Pure helpers** → a plain `.ts` file (`utils.ts`, `constants.ts`,
   `storage.ts`). No JSX, no React. Easiest to move, impossible to break.
2. **Static/leaf JSX** → its own component file (icon maps, badges, a modal, a
   footer). Props in, JSX out.
3. **Presentational sections** → one component per visual region (header,
   sidebar, a transport bar, a status panel). These take data + callbacks as
   props and call `useT()` themselves. They hold **no** business state.
4. **Stateful clusters** → custom hooks (`useX`) in a `hooks/` folder, only when
   the state, its refs, and its effects genuinely move together. Highest risk —
   do this last and only if it stays equivalent.

Co-locate a screen's parts under a lowercase folder named for the screen, e.g.
`components/host/` holds the pieces of `components/Host.tsx`, and
`components/host/hooks/` holds its hooks. The top-level `components/Host.tsx`
stays as the thin orchestrator (state + wiring) so its public import path never
changes.

### Rules that keep splits behavior-preserving

These are why the split is mechanical rather than a rewrite — follow them and the
rendered output can't drift:

- **Don't rename CSS-module classes.** Child components import the same
  `styles/*.module.css`; class strings move verbatim.
- **Don't touch i18n.** `useT()` / `t()` / `tn()` keys and `renderWithHeart`
  usage move unchanged. Presentational children call `useT()` locally rather than
  receiving `t` as a prop.
- **Prefer plain props over Context.** If a prop list gets unwieldy, pass one
  typed props object per child — do not reach for a state-management library or
  restructure the state.
- **Move load-bearing "why" comments with the code they explain.** A comment
  documenting a subtle invariant (a ref that mirrors state, a once-only guard, a
  polling pause) belongs next to that code in its new home.
- When you move an effect into a hook, move its refs and their sync effects with
  it and keep dependency arrays identical.

### Verify every extraction

Structural refactors must not change behavior. After each extraction (work
incrementally — one seam at a time, not one giant edit):

```
npx tsc --noEmit -p tsconfig.json     # must stay clean
pnpm exec vitest run                  # must stay green (currently 651 passing)
```

The `git diff` should read as moves + wiring only — no changed logic, class
names, or i18n keys.
