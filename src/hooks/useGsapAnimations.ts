import { useEffect, useState } from 'react';

let gsapPromise: Promise<any> | null = null;
let gsapLoaded = false;

function ensureGsap(): Promise<void> {
  if (gsapLoaded) return Promise.resolve();
  if (!gsapPromise) {
    gsapPromise = (async () => {
      try {
        const gsapModule = await import('gsap');
        const gsap = gsapModule.default;
        const stModule = await import('gsap/ScrollTrigger');
        const ScrollTrigger = stModule.ScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);
        (window as any).__GSAP = gsap;
        (window as any).__GSAP_ST = ScrollTrigger;
        gsapLoaded = true;
      } catch {
        console.warn('[GSAP] failed to load – scroll animations disabled');
      }
    })();
  }
  return gsapPromise;
}

function getGsap() {
  return (window as any).__GSAP as any;
}

function getSt() {
  return (window as any).__GSAP_ST as any;
}

function useGsapReady() {
  const [ready, setReady] = useState(gsapLoaded);
  useEffect(() => {
    if (gsapLoaded) { setReady(true); return; }
    ensureGsap().then(() => setReady(true));
  }, []);
  return ready;
}

export function useGsapTextReveal(ref: { current: HTMLElement | null }, options?: { stagger?: number }) {
  const ready = useGsapReady();
  useEffect(() => {
    if (!ready) return;
    const gsap = getGsap();
    const ScrollTrigger = getSt();
    if (!gsap || !ScrollTrigger) return;
    const el = ref.current;
    if (!el) return;
    const words = el.querySelectorAll('.reveal-word');
    if (!words.length) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(words,
        { opacity: 0.1, y: 20 },
        {
          opacity: 1,
          y: 0,
          stagger: options?.stagger ?? 0.08,
          duration: 0.5,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 80%',
            end: 'top 30%',
            scrub: 1.5,
          },
        }
      );
    }, el);
    return () => ctx.revert();
  }, [ref, options?.stagger, ready]);
}

export function useGsapImageScale(ref: { current: HTMLElement | null }) {
  const ready = useGsapReady();
  useEffect(() => {
    if (!ready) return;
    const gsap = getGsap();
    const ScrollTrigger = getSt();
    if (!gsap || !ScrollTrigger) return;
    const el = ref.current;
    if (!el) return;
    const images = el.querySelectorAll('.scale-image');
    if (!images.length) return;
    const ctx = gsap.context(() => {
      images.forEach((img: Element) => {
        gsap.fromTo(img,
          { scale: 0.8, opacity: 0.4 },
          {
            scale: 1,
            opacity: 1,
            scrollTrigger: {
              trigger: img,
              start: 'top 85%',
              end: 'top 35%',
              scrub: 1.2,
            },
          }
        );
        gsap.to(img, {
          opacity: 0.2,
          scale: 0.9,
          scrollTrigger: {
            trigger: img,
            start: 'top 10%',
            end: 'top -30%',
            scrub: 1,
          },
        });
      });
    }, el);
    return () => ctx.revert();
  }, [ref, ready]);
}

export function useGsapScrollFade(ref: { current: HTMLElement | null }) {
  const ready = useGsapReady();
  useEffect(() => {
    if (!ready) return;
    const gsap = getGsap();
    const ScrollTrigger = getSt();
    if (!gsap || !ScrollTrigger) return;
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(el,
        { opacity: 0, y: 60 },
        {
          opacity: 1,
          y: 0,
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            end: 'top 40%',
            scrub: 1,
          },
        }
      );
    }, el);
    return () => ctx.revert();
  }, [ref, ready]);
}
