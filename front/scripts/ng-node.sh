#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${NVM_BIN:-}" && -x "${NVM_BIN}/node" ]]; then
  exec "${NVM_BIN}/node" ./node_modules/@angular/cli/bin/ng.js "$@"
fi

exec node ./node_modules/@angular/cli/bin/ng.js "$@"
