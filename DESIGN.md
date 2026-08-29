# Zorta Design System

## Change the identity

Edit `config/theme.ts`.

That file controls:

- dark mode colours
- light mode colours
- accent colour
- display/body/mono font stacks
- display weight
- border radius
- animation timing

The rest of the UI consumes CSS variables generated from that config.

## Logo / brand files

Put final identity assets in `public/brand/`:

- `logo.svg`
- `mark.svg`
- `favicon.svg`

The React brand component is `Components/Brand/Logo.tsx` and the asset paths are centralized in `config/assets.ts`.

## Visual principle

Zorta deliberately avoids the standard startup-dashboard vocabulary: glass cards, gradients, pill forests, giant shadows and floating panels.

The core vocabulary is:

**type + rules + negative space + restrained colour + evidence.**

The accent is meant to behave like ink or a marker, not neon UI paint.
