# Repository Guidelines

## Project Structure & Module Organization

N1 Stream Controller Studio is a Tauri 2 Linux desktop application. The plain frontend lives at the repository root in `index.html`, `styles.css`, and `app.js`; `scripts/build-frontend.sh` copies it into generated `dist/`. Native application and tray logic lives in `src-tauri/src/`, while `driver/n1_service.py` is the Python USB/HID sidecar. Keep driver tests in `driver/test_n1_service.py`, Rust unit tests beside their code under `#[cfg(test)]`, documentation in `docs/`, reusable profiles in `examples/`, and shipped artwork in `assets/`.

Do not commit generated or local state such as `.venv/`, `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/binaries/`, `.streamctrl-config.json`, or `.streamctrl-assets/`.

## Build, Test, and Development Commands

- `npm install` installs the pinned Tauri CLI.
- `npm run setup:driver` prepares the Python environment, vendor SDK, and USB permissions.
- `npm run dev` builds required native artifacts and starts the Tauri application.
- `npm run check` runs the full gate: frontend and sidecar builds, JavaScript/Python/shell syntax checks, Python unit tests, `cargo fmt --check`, and locked Rust tests.
- `npm run build` creates a release build.
- `npm run driver:probe` checks N1 discovery without launching the UI.

Run `npm run check` before submitting changes. Hardware-affecting work should also be exercised on an N1 when available.

## Coding Style & Naming Conventions

Match existing formatting: two-space indentation and semicolons in JavaScript, four spaces and type hints in Python, and standard `rustfmt` output in Rust. Use `camelCase` for JavaScript identifiers, `snake_case` for Python and Rust functions, `PascalCase` for classes and Rust types, and uppercase names for constants. Shell scripts use Bash, `set -euo pipefail`, and quoted expansions. There is no separate JavaScript formatter; keep edits consistent and validate with `npm run check`.

## Testing Guidelines

Python tests use `unittest`, classes ending in `Tests`, and methods named `test_<behavior>`. Rust tests remain in the inline `tests` module. Add regression coverage for driver protocol, lifecycle, validation, or native command changes. No numeric coverage threshold is enforced; favor focused behavioral assertions and mocks over requiring connected hardware.

## Commit & Pull Request Guidelines

History uses short, imperative, sentence-case subjects such as `Add start on login setting` and `Fix lock screen action on desktop sessions`. Keep commits focused. Pull requests should explain user-visible behavior, list validation performed, link relevant issues, and include screenshots for UI changes. Call out hardware testing, USB protocol assumptions, configuration changes, and any untested paths.
