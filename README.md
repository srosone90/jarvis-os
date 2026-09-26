# Jarvis OS

Pannello domotico a muro (PWA) per Home Assistant, pensato per un tablet 8" in
orizzontale acceso 24/7.

## Stato

| Parte | Stato |
|---|---|
| Pacchetto Home Assistant (scaldabagno, scene, presenza, batterie) | Pronto e provato: [`home-assistant/`](home-assistant/README.md) |
| Mockup della schermata principale | [`docs/mockup.html`](docs/mockup.html), in attesa di approvazione |
| App (F1–F6) | Da iniziare dopo l'approvazione del mockup |

## Lato server

L'app sarà servita da Home Assistant stesso, nella cartella
`/config/www/jarvis/`, all'indirizzo `<HA>/local/jarvis/`. Si apre sulla stessa
origine di HA, quindi non serve configurare CORS. Il microfono funziona solo in
HTTPS. I dettagli arrivano con la fase F1.

Architettura, decisioni e convenzioni sono in [`CLAUDE.md`](CLAUDE.md).
