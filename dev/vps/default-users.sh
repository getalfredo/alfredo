#!/bin/sh
# Creates the default dev users on both fake VPSes:
#   windsor@windsor.com / password
#   dover@dover.com     / password
# Safe to re-run: if a user already exists, its password is reset to the default.

COMPOSE="docker compose -f dev/vps/compose.yaml"

for vps in windsor dover; do
  email="$vps@$vps.com"
  echo "[$vps] creating $email..."
  if ! printf '%s\npassword\npassword\n' "$email" | $COMPOSE exec -T "$vps" alfredo user:create; then
    echo "[$vps] $email already exists — resetting password to default"
    printf '%s\npassword\npassword\n' "$email" | $COMPOSE exec -T "$vps" alfredo user:reset-pw
  fi
done
