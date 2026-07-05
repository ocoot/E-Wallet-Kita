// lottie-web menyertakan type declaration sendiri di versi modern. File ini
// hanya fallback ambient shim -- kalau TypeScript sudah menemukan tipe asli
// dari package-nya, deklarasi longgar di sini tidak akan menimpa itu secara
// merugikan, hanya mencegah error "could not find declaration file" di
// lingkungan yang setup module resolution-nya berbeda.
declare module "lottie-web" {
  interface AnimationItem {
    destroy(): void;
    play(): void;
    pause(): void;
    setSpeed(speed: number): void;
    goToAndStop(value: number, isFrame?: boolean): void;
    addEventListener(name: string, callback: (...args: unknown[]) => void): void;
    removeEventListener(name: string, callback?: (...args: unknown[]) => void): void;
  }

  interface AnimationConfigWithData {
    container: Element;
    renderer?: "svg" | "canvas" | "html";
    loop?: boolean | number;
    autoplay?: boolean;
    animationData?: object;
    path?: string;
    rendererSettings?: Record<string, unknown>;
  }

  interface LottiePlayer {
    loadAnimation(params: AnimationConfigWithData): AnimationItem;
    destroy(name?: string): void;
    setQuality(quality: string | number): void;
  }

  const lottie: LottiePlayer;
  export default lottie;
}
