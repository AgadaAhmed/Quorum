# Themes — tonal theme system (Pro perk)

**Date:** 2026-08-31
**Status:** Approved (design), Path 1 (tonal, on-brand)

## Goal

Let users choose from a rich set of **tonal themes** — all in the app's minimal
greyscale family, no colorful skins (Path 1, user-approved). Themes are the real
Pro perk that replaces the removed "custom covers & themes" paywall line.

Free users get **Light** + **Midnight** (dark). Pro unlocks the full set.

## The hard problem

The app reads a **static** `Colors` object from `lib/theme.ts` in **42 files**
(~1,042 `Colors.*` references), almost all inside **module-level
`StyleSheet.create(...)`**, which captures colours at import time. So colours
cannot currently change at runtime. There is no synchronous storage (`mmkv`) and
no `expo-updates`, and the app must keep running in **Expo Go** (rules out native
sync-storage + reload hacks). Therefore live theming requires a render-time
palette via a provider + hook, and a mechanical migration of the static
stylesheets.

## Architecture

- **`lib/theme.ts`**: define a `ThemePalette` type (the shape of today's `Colors`)
  and one palette object per theme. Keep exporting `Colors` = the **Light**
  palette as the default, so any not-yet-migrated file keeps compiling and
  renders in Light. **This makes the migration incremental and always-shippable.**
  The non-colour tokens (`Fonts`, `FontSize`, `FontWeight`, `Radius`, `Spacing`)
  are theme-independent and stay static.
- **`ThemeProvider`** (`lib/ThemeContext.tsx`): holds the active theme name +
  palette; loads the saved choice from AsyncStorage on mount (defaults to Light
  until loaded); exposes `setTheme(name)`, persists it, and (for Pro gating)
  refuses to select a locked theme for free users.
- **`useTheme()`**: returns the active `ThemePalette`.
- **`useThemedStyles(makeStyles)`**: returns `useMemo(() => makeStyles(theme),
  [theme])`.

### The migration pattern (applied per file, mechanically)

For each file whose `StyleSheet.create` uses colours:

1. Wrap the stylesheet in a factory whose **parameter is named `Colors`**, so the
   stylesheet body is unchanged:
   ```ts
   const makeStyles = (Colors: ThemePalette) => StyleSheet.create({ /* body unchanged */ });
   ```
2. In the component, get the live palette and build styles from it:
   ```ts
   const Colors = useTheme();
   const styles = useThemedStyles(makeStyles);
   ```
   Because the local `const Colors` shadows the import, any **inline** `Colors.x`
   in the component's JSX resolves to the live palette too.
3. Remove `Colors` from the file's `import { ... } from '.../theme'` (keep the
   other tokens). Components that use `Colors` only in the stylesheet still need
   `const Colors = useTheme();` if they have inline colour usage; if they have
   **none**, just `const styles = useThemedStyles(makeStyles);` suffices.
4. **Module-level colour constants** (e.g. `const SCRIM = [Colors.overlay, ...]`
   outside a component/stylesheet) must move **into** `makeStyles` or the
   component, since there's no live palette at module scope. Flag any that can't
   move cleanly.

A file is "done" when it has no module-scope `Colors.*` reads and renders from
`useTheme()`.

## The themes (all tonal / greyscale)

Same key structure as today's `Colors`. Values tuned per palette:

- **Light** — current palette (white bg, near-black text). *Free.*
- **Midnight** — dark grey (`#121212`-ish surfaces, light text). *Free.*
- **AMOLED** — true black (`#000`) surfaces, light text; battery-friendly. *Pro.*
- **High Contrast** — pure black/white, maximal contrast (accessibility). *Pro.*
- **Warm Paper** — warm off-white / cream greys, dark warm text. *Pro.*
- **Cool Slate** — cool neutral greys. *Pro.*

(Exact hex values defined in the implementation plan. The celebration `accent`
green stays constant across themes — it's the one deliberate hue.)

## Picker UI + persistence + gating

- A **Theme** section in `app/settings.tsx` (or a dedicated `app/appearance.tsx`):
  a list of theme swatches (rendered from each palette's own colours), current
  one checked. Selecting a **Pro-locked** theme while free opens the existing
  `PaywallModal` instead of applying it.
- Persist the chosen theme name in **AsyncStorage** (and mirror to the user doc so
  it follows the account — optional, secondary).
- Re-add **"Themes"** to the `PaywallModal` `FEATURES` list once shipped.

## Phasing (each phase leaves the app working & tested)

1. **Infra**: `ThemePalette` type, all palettes, `ThemeProvider`, `useTheme`,
   `useThemedStyles`; `Colors` stays = Light; wrap root in `ThemeProvider`; a
   temporary dev switch to prove it works. tsc + tests green.
2. **Migrate files in batches** by area (components/, then each screen group),
   converting to the `makeStyles`/`useTheme` pattern. tsc + tests after each batch.
3. **Picker UI + Pro gating + persistence**; re-add Themes to the paywall.

## Testing

- Unit: `ThemeProvider` selects/persists; free user can't select a Pro theme
  (falls back / triggers paywall); `useThemedStyles` returns per-theme styles.
- Keep `tsc` clean and the jest suite green after every phase/batch.
- Manual smoke (device/Expo Go): switch each theme, verify every screen re-colours
  with no light-mode leftovers.

## Out of scope

Colorful (non-greyscale) themes (Path 2 was declined). Syncing theme across
devices beyond a simple user-doc mirror. Per-component theme overrides.
