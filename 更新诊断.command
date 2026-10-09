#!/bin/bash
cd "$(dirname "$0")" || exit 1
exec bash ./scripts/mac-entry.sh update-status
