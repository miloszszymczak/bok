#!/usr/bin/env bash
# Release: bump version → check & test → build & push image → pin the tag in the prod overlay.
#
#   ./scripts/release.sh            # patch (0.1.0 → 0.1.1)
#   ./scripts/release.sh minor      # 0.1.x → 0.2.0
#   ./scripts/release.sh major
#
# Env: REGISTRY (default git.mwsz.org/milek), PLATFORMS (default linux/amd64), SKIP_CHECKS=1
set -euo pipefail
cd "$(dirname "$0")/.."

BUMP="${1:-patch}"
case "$BUMP" in patch | minor | major) ;; *) echo "usage: $0 [patch|minor|major]" >&2; exit 1 ;; esac

REGISTRY="${REGISTRY:-git.mwsz.org/milek}"
IMAGE="$REGISTRY/bok"
PLATFORMS="${PLATFORMS:-linux/amd64}"
OVERLAY=deploy/overlays/prod/kustomization.yaml

if [[ "${SKIP_CHECKS:-}" != "1" ]]; then
	echo "› typecheck + tests"
	npm run check --silent
	npm test --silent
fi

CURRENT=$(node -p "require('./package.json').version")
NEXT=$(node -e "
const [a,b,c] = '$CURRENT'.split('.').map(Number);
console.log({ major: \`\${a+1}.0.0\`, minor: \`\${a}.\${b+1}.0\`, patch: \`\${a}.\${b}.\${c+1}\` }['$BUMP']);")
echo "› $CURRENT → $NEXT ($PLATFORMS)"

docker buildx build \
	--platform "$PLATFORMS" \
	--build-arg "BOK_VERSION=$NEXT" \
	-t "$IMAGE:$NEXT" -t "$IMAGE:latest" \
	--push .

# Only record the new version once the image is actually in the registry.
npm version "$NEXT" --no-git-tag-version --allow-same-version >/dev/null
sed -i.bak -E "s/(newTag: )\"?[^\"]*\"?/\1\"$NEXT\"/" "$OVERLAY" && rm -f "$OVERLAY.bak"

echo
echo "✓ pushed $IMAGE:$NEXT"
echo "  deploy: kubectl apply -k deploy/overlays/prod"
