#!/usr/bin/env bash
set -euo pipefail

backend_container="manecomb-backend-ci"
web_container="manecomb-web-ci"

cleanup() {
  docker rm -f "$backend_container" "$web_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for_url() {
  local url="$1"
  local container="$2"

  for _ in $(seq 1 30); do
    if curl --fail --silent --show-error "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done

  echo "No respondio $url" >&2
  docker logs "$container" >&2 || true
  return 1
}

docker run --detach --name "$backend_container" --publish 5000:5000 \
  --env APP_URL=https://app.example.invalid \
  --env CLIENT_ORIGIN=https://client.example.invalid \
  --env EMAIL_DRY_RUN=true \
  --env EMAIL_ENABLED=false \
  --env ENABLE_QUEUES=false \
  --env ENABLE_REDIS=false \
  --env JWT_SECRET=ci-runtime-secret-with-at-least-32-characters \
  --env PAYMENT_PROVIDER=manual \
  --env REQUIRE_MONGO=false \
  manecomb-backend:ci >/dev/null

wait_for_url "http://127.0.0.1:5000/api/health/live" "$backend_container"
curl --fail --silent --show-error "http://127.0.0.1:5000/api/health" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const d=JSON.parse(s);if(d.ok!==true)process.exit(1)})"
curl --fail --silent --show-error "http://127.0.0.1:5000/api/commercial/plans" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const d=JSON.parse(s);if(d.ok!==true||!Array.isArray(d.data))process.exit(1)})"

docker build --file mobile/Dockerfile.web --tag manecomb-web:ci \
  --build-arg VITE_API_URL=/api \
  --build-arg VITE_SOCKET_URL=/ \
  . >/dev/null

docker run --detach --name "$web_container" --publish 8080:80 manecomb-web:ci >/dev/null
wait_for_url "http://127.0.0.1:8080/" "$web_container"
curl --fail --silent --show-error "http://127.0.0.1:8080/reset-password?token=ci" \
  | grep --quiet '<div id="root"></div>'
curl --fail --silent --show-error "http://127.0.0.1:8080/portal" \
  | grep --quiet '<div id="root"></div>'

echo "ok - contenedores backend y web responden con rutas SPA"
