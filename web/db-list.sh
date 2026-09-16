#!/usr/bin/env bash
#################################################
# web/db-list.sh
#
# Refresh web/db-backups.json from the SourceForge db/ directory, so the
# backup page never has to talk to SourceForge inside a request.
#
# usage: bash web/db-list.sh
#################################################
set -u
. "$(dirname "$(readlink -f "$0")")/db-common.sh"

write_list
