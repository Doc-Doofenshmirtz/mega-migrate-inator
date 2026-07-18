#!/bin/sh
# Docker's bridge networking requires the process to bind 0.0.0.0 *inside*
# the container even when the host-side port mapping is restricted to
# 127.0.0.1 (see docker-compose.yml) — server.js can't tell those two things
# apart from HOST alone, so it correctly demands a password for HOST=0.0.0.0
# regardless. Rather than silently weakening that guard for the container
# case, generate a random password on first boot when the operator hasn't
# set one, and print it once so `docker compose up` still "just works"
# without ever shipping a fixed/guessable default.
set -e

if [ -z "$GLAB2GH_AUTH_PASSWORD" ] && [ "$HOST" != "127.0.0.1" ] && [ "$HOST" != "localhost" ] && [ -n "$HOST" ]; then
  GLAB2GH_AUTH_PASSWORD="$(node -e "console.log(require('node:crypto').randomBytes(18).toString('base64url'))")"
  export GLAB2GH_AUTH_PASSWORD
  echo "=================================================================="
  echo " glab2gh: no GLAB2GH_AUTH_PASSWORD was set, so one was generated:"
  echo ""
  echo "   $GLAB2GH_AUTH_PASSWORD"
  echo ""
  echo " Use it to sign in at http://localhost:3000. Set GLAB2GH_AUTH_PASSWORD"
  echo " yourself to choose your own, or set HOST=127.0.0.1 to skip auth"
  echo " entirely (only safe if nothing outside this machine can reach it)."
  echo "=================================================================="
fi

exec node server.js
