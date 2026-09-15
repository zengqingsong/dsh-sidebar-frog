#!/bin/sh
# Pre-commit guard: keep the built bundles (src/host.js, src/client.js) in sync
# with the modular source under src/{host,client,shared}/.
#
# `scripts/check.js --fix` does the work: it checks the embedding hazards the
# build itself cannot see (backticks / ${ / </script> reaching a template
# literal), rebuilds the bundles only when the sources actually changed, and
# parses + smoke-loads both bundles. It then blocks the commit when the STAGED
# bundles were stale (source edited but not rebuilt) — the case that used to
# ship a plugin whose runtime code did not match its source.
#
# `--no-browser` keeps the hook fast and hermetic: the real-browser suite
# (scripts/browser-tests.js) launches Chrome/Edge and takes ~10s, so it belongs
# to `npm run check`, not to every commit.
#
# Install once with:
#
#   ln -sf ../../scripts/precommit.sh .git/hooks/pre-commit
set -e

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "[pre-commit] 校验并（必要时）重建 src/host.js / src/client.js …"
node scripts/check.js --fix --no-browser

if ! git diff --quiet -- src/host.js src/client.js; then
  echo "" >&2
  echo "[pre-commit] ✗ 构建产物与源码不同步，已取消本次提交。" >&2
  echo "[pre-commit]   已重新构建产物，请执行:" >&2
  echo "[pre-commit]     git add src/host.js src/client.js && git commit" >&2
  exit 1
fi

echo "[pre-commit] ✓ 构建产物已同步"
