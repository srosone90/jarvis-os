import type { Fotogramma, Occhio } from "./presenza";

/**
 * La fotocamera frontale vera (v0.6.0): getUserMedia, un <video> fuori dalla
 * pagina e un <canvas> 320×240 da cui si legge il fotogramma di adesso.
 * Niente si salva: il canvas viene riscritto a ogni fotogramma e svuotato
 * quando si chiude.
 */
export class OcchioFotocamera implements Occhio {
  private flusso: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private contesto: CanvasRenderingContext2D | null = null;

  get aperto(): boolean {
    return this.flusso !== null;
  }

  async apri(fps: number): Promise<void> {
    if (this.flusso) return;
    if (!navigator.mediaDevices?.getUserMedia)
      throw Object.assign(new Error("getUserMedia non disponibile"), { name: "MediaNonDisponibile" });
    const flusso = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: fps, max: Math.max(fps, 5) },
      },
    });
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = flusso;
    try {
      await video.play();
    } catch (errore) {
      for (const t of flusso.getTracks()) t.stop();
      throw errore;
    }
    const tela = document.createElement("canvas");
    tela.width = 320;
    tela.height = 240;
    this.flusso = flusso;
    this.video = video;
    this.contesto = tela.getContext("2d", { willReadFrequently: true });
  }

  chiudi(): void {
    for (const t of this.flusso?.getTracks() ?? []) t.stop();
    if (this.video) this.video.srcObject = null;
    this.contesto?.clearRect(0, 0, 320, 240);
    this.flusso = null;
    this.video = null;
    this.contesto = null;
  }

  fotogramma(): Fotogramma | null {
    const v = this.video;
    const c = this.contesto;
    if (!v || !c || v.readyState < 2 || !v.videoWidth) return null;
    // anisotropo come vuole il modello (320×240 qualunque sia la fotocamera)
    c.drawImage(v, 0, 0, 320, 240);
    return { rgba: c.getImageData(0, 0, 320, 240).data, w: 320, h: 240 };
  }
}
