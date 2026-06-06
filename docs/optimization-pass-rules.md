# Optimization Pass — Agent Rules (TEMPORARY)

> Delete this file when the optimization pass is merged.

Every agent working on this pass MUST follow these rules exactly. You own ONE
file. Do all four concerns on it: UI/UX polish, performance, code quality, bugs.
Aggressive restructuring within your file is allowed and encouraged.

## HARD CONSTRAINTS (never violate)

1. **Strictly monochrome.** Black / white / grey ONLY. No hue anywhere — no
   teal, red, gold, blue, green, orange, purple, pink, yellow.
2. **No emojis.** None in JSX text, labels, placeholders, comments, or strings.
   If you find any, remove them.
3. **Use theme tokens, not literals.** Import from `lib/theme.ts`
   (`Colors`, `Spacing`, `Radius`, `FontSize`, `FontWeight`, `Fonts`, `Shadow`).
   The theme is already fully grayscale — prefer tokens over raw hex.
4. **No new dependencies.** Do not add packages.
5. **No API / Firebase schema / data-model changes.** Don't touch Firestore
   queries' shape, collection names, auth flow, or RevenueCat logic.
6. **Preserve all behavior.** Only fix genuine bugs. Don't remove features.
7. **Stay in your file.** Do not edit other screens, shared components, or
   `lib/theme.ts`. If you find a shared issue, report it in your summary instead.

## Color mapping for any stray literal you find

Replace raw color hex with the nearest theme token (preferred) or grayscale:

| Found (examples)                | Replace with                       |
|---------------------------------|------------------------------------|
| Orange `#fb923c #f97316`        | `Colors.textMuted` (#5c5959)       |
| Red `#ef4444 #f43f5e #ba1a1a`   | `Colors.error` (#1a1a1a)           |
| Teal/green `#0d9488 #22c55e`    | `Colors.secondary` (#2b2b2b)       |
| Gold/yellow `#FFD700 #eab308`   | `Colors.gold` (#4a4a4a)            |
| Blue/sky `#0a7ea4 #38bdf8`      | `Colors.secondaryLight` (#555555)  |
| Purple/pink `#c084fc #fb7185`   | `Colors.goldLight` (#6b6b6b)       |
| Any other hue                   | nearest grey by perceptual darkness|

Star ratings: filled = `Colors.text`, empty = `Colors.textDisabled`.
Already-grey literals (`#fff #000 #808080 #5c5959 #1a1a1a #f2f2f2`) are fine but
prefer the matching token.

## What "optimize" means per concern

- **UI/UX:** consistent spacing (Spacing scale), typography hierarchy
  (FontSize/FontWeight), proper interaction/press states, loading & empty states,
  accessible hit targets (min 44px) and `accessibilityLabel`s on icon buttons.
- **Performance:** memoize expensive children (`React.memo`), `useCallback`/
  `useMemo` for handlers/derived data, `FlatList`/`FlashList` keyExtractor +
  `getItemLayout` where lists are long, avoid inline object/array literals in
  render, remove dead state and redundant re-renders.
- **Code quality:** extract repeated JSX into local sub-components, kill dead
  code, fix TypeScript `any`/implicit types, ensure lint passes, split a giant
  file into local components within the same file (or co-located) if it helps.
- **Bugs/robustness:** guard against undefined/null data, handle async errors,
  fix obvious logic bugs, add keys to mapped lists, fix stale-closure issues.

## Output

Return a concise summary: what you changed per concern, any bugs found/fixed,
and anything you noticed outside your file that someone else should handle.
