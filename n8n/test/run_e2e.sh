#!/usr/bin/env bash
# Runs the real n8n workflow in Docker against local mocks and checks every path.
#   bash n8n/test/run_e2e.sh
# Needs Docker and Node 18+. Uses ports 5678 (n8n) and 8787 (mocks), host networking (Linux).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
IMAGE="${N8N_IMAGE:-docker.n8n.io/n8nio/n8n:latest}"
NAME=bookleaf-n8n-e2e
BUILD="$HERE/.build"

node "$ROOT/scripts/generate_data.mjs" >/dev/null
# The fake Bedrock host resolves to the mock, so n8n signs exactly as it would for AWS.
BEDROCK_HOST=bedrock-runtime.us-east-1.amazonaws.com
node "$ROOT/n8n/build_workflow.mjs" --test http://127.0.0.1:8787 --bedrock "http://$BEDROCK_HOST:8787"

cat > "$BUILD/credentials.json" <<'JSON'
[
  {"id":"bookleafWebhookKey","name":"BookLeaf Webhook Key (X-BookLeaf-Key)","type":"httpHeaderAuth","data":{"name":"X-BookLeaf-Key","value":"test-webhook-key"}},
  {"id":"awsBedrock","name":"AWS Bedrock (IAM access key)","type":"aws","data":{"region":"us-east-1","accessKeyId":"AKIDEXAMPLE","secretAccessKey":"wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY","temporaryCredentials":false}},
  {"id":"bubbleApiToken","name":"Bubble API Token (Authorization: Bearer)","type":"httpHeaderAuth","data":{"name":"Authorization","value":"Bearer test-bubble-token"}}
]
JSON

node "$HERE/mock_services.mjs" &
MOCK_PID=$!
cleanup() { kill "$MOCK_PID" 2>/dev/null || true; docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --network host --add-host "$BEDROCK_HOST:127.0.0.1" \
  -e N8N_ENCRYPTION_KEY=e2e-test-key -e N8N_DIAGNOSTICS_ENABLED=false -e N8N_SECURE_COOKIE=false \
  -v "$BUILD:/e2e:ro" --entrypoint sh "$IMAGE" -c '
    n8n import:credentials --input=/e2e/credentials.json &&
    n8n import:workflow --input=/e2e/workflow.test.json &&
    n8n publish:workflow --id=bookleafRoyaltyTest &&
    exec n8n start' >/dev/null

printf 'waiting for n8n'
for _ in $(seq 1 90); do
  if curl -fs http://127.0.0.1:5678/healthz/readiness >/dev/null 2>&1; then break; fi
  printf '.'; sleep 2
done
echo
sleep 3 # let webhooks register

node "$HERE/e2e.mjs" || { echo '--- n8n logs ---'; docker logs --tail 80 "$NAME"; exit 1; }
