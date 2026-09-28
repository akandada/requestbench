#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if [[ -f "$HOME/.cargo/env" ]]; then
  source "$HOME/.cargo/env"
fi
if ! command -v cargo >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
  print 'Install Node.js 22+ and Rust using rustup, then run this launcher again.'
  read '?Press Enter to close.'
  exit 1
fi
npm start
