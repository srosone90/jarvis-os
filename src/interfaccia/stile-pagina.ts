import { css } from "lit";

/**
 * Stile comune delle schermate arrivate con la v0.5.7 (Timer, Clima, Scene,
 * Spesa, Avvisi, Altro): come Meteo e Stanza, la pagina scorre dentro il suo
 * spazio sul tablet e segue il ritmo 4/8/12/16.
 */
export const stilePagina = css`
  :host {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 600;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--attenuato);
  }
  section {
    min-width: 0;
  }
  .nota {
    color: var(--attenuato);
    font-size: 15px;
    overflow-wrap: break-word;
  }
  .riquadro {
    padding: 14px 16px;
    border-radius: var(--raggio);
    background: var(--superficie);
    min-width: 0;
  }
  .riga {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 10px 4px;
    border-bottom: 1px solid #1c2029;
  }
  .riga .icona {
    width: 24px;
    height: 24px;
    flex: none;
    color: var(--attenuato);
  }
  .riga .testo {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-size: 17px;
    overflow-wrap: break-word;
  }
  .riga .testo small {
    color: var(--attenuato);
    font-size: 14px;
  }
  button.pulsante {
    min-height: 48px;
    padding: 0 16px;
    border-radius: 24px;
    border: 1px solid #343a46;
    background: var(--superficie);
    color: var(--testo);
    font: inherit;
    font-size: 16px;
    cursor: pointer;
    touch-action: manipulation;
  }
  button.pulsante:disabled {
    opacity: 0.4;
    cursor: default;
  }
  @media (orientation: landscape) and (max-height: 559px) {
    :host {
      gap: 10px;
    }
  }
`;
