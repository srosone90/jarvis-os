#!/usr/bin/env bash
# Segue il workflow «Release» di UN commit fino a un esito, qualunque sia
# (lezione del 02/10: tre attese si sono bloccate perché aspettavano solo il
# successo). Esce sempre, e dice cosa è successo:
#   0  release pubblicata (stampa tag e digest)
#   1  workflow fallito o annullato (stampa l'indirizzo del run)
#   2  workflow finito senza pubblicare (la release esisteva già)
#   3  tempo scaduto (di serie 60 minuti)
# Uso: scripts/segui-release.sh <sha del commit> [minuti]
set -u
sha="${1:?serve lo sha del commit}"
minuti="${2:-60}"
repo="srosone90/jarvis-os"
api="https://api.github.com/repos/$repo"
fine=$(( $(date +%s) + minuti * 60 ))
ultimo=""
while [ "$(date +%s)" -lt "$fine" ]; do
  run=$(curl -fsS "$api/actions/workflows/release.yml/runs?head_sha=$sha&per_page=5" 2>/dev/null) || { sleep 60; continue; }
  riga=$(printf '%s' "$run" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const r = (JSON.parse(s).workflow_runs ?? [])[0];
      if (r) console.log([r.id, r.status, r.conclusion ?? "-", r.html_url].join(" "));
    });')
  if [ -n "$riga" ] && [ "$riga" != "$ultimo" ]; then echo "$(date -u +%H:%M) $riga"; ultimo="$riga"; fi
  read -r id stato esito url <<<"${riga:-x x x x}"
  if [ "$stato" = "completed" ]; then
    tag="v$(git show "$sha:package.json" 2>/dev/null | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).version')"
    rel=$(curl -fsS "$api/releases/tags/$tag" 2>/dev/null || true)
    if [ "$esito" = "success" ] && printf '%s' "$rel" | grep -q "\"target_commitish\": *\"$sha\""; then
      echo "PUBBLICATA $tag $(printf '%s' "$rel" | grep -o '"digest": *"[^"]*"')"
      exit 0
    elif [ "$esito" = "success" ]; then
      echo "FINITA SENZA PUBBLICARE: $tag esisteva già (o la release è di un altro commit)"
      exit 2
    else
      echo "FALLITA ($esito): $url"
      exit 1
    fi
  fi
  sleep 60
done
echo "TEMPO SCADUTO dopo $minuti minuti: il workflow di $sha non è finito (ultimo stato: ${ultimo:-nessun run trovato})"
exit 3
