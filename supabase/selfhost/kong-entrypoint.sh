#!/bin/sh
# Kong declarative-config doesn't expand ${VAR} on its own (Kong 2.x). The
# kong.yml we bake into the image references $SUPABASE_ANON_KEY and
# $SUPABASE_SERVICE_KEY as placeholder consumer credentials — we substitute
# them at container start so the actual JWTs from the env get embedded.
#
# `envsubst` is restricted to those two names so any other shell-style
# tokens in the YAML pass through untouched.
#
# We write the rendered file to /tmp (always world-writable) so we don't
# have to worry about owning /home/kong as the non-root kong user.
set -e

envsubst '${SUPABASE_ANON_KEY} ${SUPABASE_SERVICE_KEY}' \
  < /etc/kong/kong.yml.template \
  > /tmp/kong.yml

exec /docker-entrypoint.sh "$@"
