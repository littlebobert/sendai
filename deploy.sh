#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

usage() {
  cat <<'EOF'
Usage: ./deploy.sh <acr-name> <resource-group> [parameters-file]

Environment overrides:
  TAG              Image tag to build. Defaults to a timestamp.
  DEPLOYMENT_NAME  Azure deployment name. Defaults to store-agent.

Example:
  ./deploy.sh myregistry my-resource-group
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

ACR_NAME="${1:-${ACR_NAME:-}}"
RESOURCE_GROUP="${2:-${AZURE_RESOURCE_GROUP:-}}"
PARAMETERS_FILE="${3:-${PARAMETERS_FILE:-infra/bicep/main.parameters.json}}"
DEPLOYMENT_NAME="${DEPLOYMENT_NAME:-store-agent}"
TAG="${TAG:-$(date +%Y%m%d-%H%M%S)}"

if [[ -z "$ACR_NAME" || -z "$RESOURCE_GROUP" ]]; then
  usage >&2
  exit 1
fi

if [[ ! -f "$PARAMETERS_FILE" ]]; then
  echo "Parameters file not found: $PARAMETERS_FILE" >&2
  exit 1
fi

az acr build --registry "$ACR_NAME" --image "store-agent/api:${TAG}" --file apps/api/Dockerfile .
az acr build --registry "$ACR_NAME" --image "store-agent/worker:${TAG}" --file apps/worker/Dockerfile .

az deployment group create \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --template-file infra/bicep/main.bicep \
  --parameters "@${PARAMETERS_FILE}" \
  --parameters "apiImage=store-agent/api:${TAG}" "workerImage=store-agent/worker:${TAG}"
